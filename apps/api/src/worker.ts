import { prisma } from "@woobe/database";
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { NotificationDeliveryError } from "./modules/notifications/domain/errors/notification-delivery.error";
import { markNotificationFailedUseCase, processNotificationJobUseCase } from "./modules/notifications/notifications.module";
import { NOTIFICATIONS_QUEUE_NAME, notificationQueueConnection } from "./modules/notifications/infrastructure/queues/notification.queue";

/**
 * Separate process from server.ts (week2 (1).md §20's own architecture
 * diagram draws "worker" as its own box, downstream of BullMQ) — run
 * alongside the API with `pnpm --filter @woobe/api run worker`. Keeping
 * this out of server.ts's own process means a slow/stuck notification send
 * can never compete with the Express event loop for CPU, satisfying
 * "no unnecessary blocking of checkout/order requests" by construction
 * rather than by care taken inside a shared process.
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
  { connection: notificationQueueConnection },
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
