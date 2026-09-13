import { prisma } from "@woobe/database";
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { NotificationDeliveryError } from "./modules/notifications/domain/errors/notification-delivery.error";
import { markNotificationFailedUseCase, processNotificationJobUseCase } from "./modules/notifications/notifications.module";
import { NOTIFICATIONS_QUEUE_NAME, notificationQueueConnection } from "./modules/notifications/infrastructure/queues/notification.queue";

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
const worker = new Worker(
  NOTIFICATIONS_QUEUE_NAME,
  async (job: Job<{ notificationId: string }>) => {
    try {
      await processNotificationJobUseCase.execute(job.data.notificationId);
    } catch (error) {
      if (error instanceof NotificationDeliveryError && !error.retryable) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  },
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

worker.on("failed", (job, error) => {
  if (!job) return;
  const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  const isUnrecoverable = error.name === "UnrecoverableError";
  if (attemptsExhausted || isUnrecoverable) {
    void markNotificationFailedUseCase.execute(job.data.notificationId, error.message);
  }
});

// eslint-disable-next-line no-console
console.log(`[notifications-worker] listening on queue "${NOTIFICATIONS_QUEUE_NAME}"`);

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notifications-worker] received ${signal}, shutting down gracefully...`);
  await worker.close();
  await prisma.$disconnect();
  notificationQueueConnection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
