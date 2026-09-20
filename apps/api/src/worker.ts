import { prisma } from "@woobe/database";
import { Queue, Worker, UnrecoverableError, type Job } from "bullmq";
import { env } from "./config/env";
import { NotificationDeliveryError } from "./modules/notifications/domain/errors/notification-delivery.error";
import { markNotificationFailedUseCase, processNotificationJobUseCase } from "./modules/notifications/notifications.module";
import { classifyFailedAttempt } from "./modules/notifications/infrastructure/queues/classify-failed-attempt";
import { NOTIFICATIONS_QUEUE_NAME, notificationQueueConnection } from "./modules/notifications/infrastructure/queues/notification.queue";
import { startMetricsServer } from "./shared/infrastructure/observability/prometheus/metrics-server";
import {
  createNotificationWorkerMetrics,
  createWorkerRegistry,
  NotificationWorkerInstrumentation,
} from "./shared/infrastructure/observability/prometheus/notification-worker-metrics";

/**
 * Separate process from server.ts (week2 (1).md §20's own architecture
 * diagram draws "worker" as its own box, downstream of BullMQ) — in
 * production, run alongside the API with `pnpm --filter @woobe/api run
 * worker` (its own deployable unit, scaled independently of the API — this
 * is deliberate, not merged with `start` on purpose). Keeping this out of
 * server.ts's own process means a slow/stuck notification send can never
 * compete with the Express event loop for CPU, satisfying "no unnecessary
 * blocking of checkout/order requests" by construction rather than by care
 * taken inside a shared process.
 *
 * Week 3 Day 8 hardening: `pnpm run dev`'s own `dev` script now starts this
 * alongside `server.ts` via `concurrently` — found live, not by inspection,
 * that it never had been: 12 real notifications sat permanently PENDING in
 * `woobe_dev` (every order-confirmation email this whole project's history
 * of local testing enqueued, none ever consumed) because nothing had ever
 * started this process as part of the normal dev workflow. The enqueue
 * side, retry policy, and idempotency below were all already correct —
 * this was purely a "nobody's listening" gap, not a code defect.
 *
 * A thrown `NotificationDeliveryError(retryable: false)` is converted to
 * BullMQ's own `UnrecoverableError` — the one BullMQ-specific concept this
 * file (not the use-case) is allowed to know about — which stops retries
 * immediately instead of burning through `attempts` on a failure retrying
 * can never fix (e.g. no contact email on file). Every other thrown error
 * is left alone so BullMQ's own attempts/backoff (configured on the queue
 * side) runs its course; only once a job's own last attempt fails does
 * this worker record that as this notification's terminal FAILED state.
 */

// Observability (docs/observability.md): this process has its OWN Registry —
// it cannot share the API's in-memory one — scraped by Prometheus from a
// loopback-only server below. A read-only Queue handle is used solely for
// scrape-time job counts; it never adds or removes jobs.
const metricsRegistry = createWorkerRegistry();
const countsQueue = new Queue(NOTIFICATIONS_QUEUE_NAME, { connection: notificationQueueConnection });
const workerMetrics = createNotificationWorkerMetrics(metricsRegistry, () =>
  countsQueue.getJobCounts("waiting", "active", "delayed", "failed"),
);
const instrumentation = new NotificationWorkerInstrumentation<Job<{ notificationId: string }>, Error>(workerMetrics, classifyFailedAttempt);

const worker = new Worker(
  NOTIFICATIONS_QUEUE_NAME,
  instrumentation.wrapProcessor(async (job: Job<{ notificationId: string }>) => {
    try {
      await processNotificationJobUseCase.execute(job.data.notificationId);
    } catch (error) {
      if (error instanceof NotificationDeliveryError && !error.retryable) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }),
  {
    connection: notificationQueueConnection,
    // Forensic-review fix (2026-09-13): was previously unset, defaulting to
    // BullMQ's own concurrency of 1 — every notification serialized behind
    // whichever one was currently sending. At the traffic this app targets
    // (order confirmations + status/return/refund notices), estimated
    // volume doesn't need this on its own, but a single hung SMTP connection
    // used to be able to block the entire queue for however long the
    // (previously unbounded) SMTP timeout took. Now that
    // nodemailer-mailer.ts bounds a single send to ~15s worst case, a modest
    // concurrency lets a handful of sends proceed in parallel without
    // exceeding this app's one SMTP account's realistic connection budget.
    // Revisit only alongside the SMTP/ESP provider's own concurrent-
    // connection limit if send volume grows materially.
    concurrency: 5,
  },
);

instrumentation.attach(worker);

worker.on("failed", (job, error) => {
  if (!job) return;
  // Same condition as before (attempts exhausted OR UnrecoverableError) — now
  // shared with the metrics so "terminal failure" means one thing in both.
  if (classifyFailedAttempt(job, error) !== "retry") {
    void markNotificationFailedUseCase.execute(job.data.notificationId, error.message);
  }
});

// A metrics-port problem (e.g. EADDRINUSE) must never stop notifications from
// being sent: log it and carry on without a scrape target.
const metricsServerPromise = startMetricsServer({ registry: metricsRegistry, host: env.WORKER_METRICS_HOST, port: env.WORKER_METRICS_PORT })
  .then((server) => {
    // eslint-disable-next-line no-console
    console.log(`[notifications-worker] metrics on http://${env.WORKER_METRICS_HOST}:${env.WORKER_METRICS_PORT}/metrics`);
    return server;
  })
  .catch((error: unknown) => {
    console.error("[notifications-worker] metrics server failed to start; continuing without it:", error instanceof Error ? error.message : error);
    return undefined;
  });

// eslint-disable-next-line no-console
console.log(`[notifications-worker] listening on queue "${NOTIFICATIONS_QUEUE_NAME}"`);

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notifications-worker] received ${signal}, shutting down gracefully...`);
  await worker.close();
  const metricsServer = await metricsServerPromise;
  await new Promise<void>((resolve) => (metricsServer ? metricsServer.close(() => resolve()) : resolve()));
  await countsQueue.close();
  await prisma.$disconnect();
  notificationQueueConnection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
