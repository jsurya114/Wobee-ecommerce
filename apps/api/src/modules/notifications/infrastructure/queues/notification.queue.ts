import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../../../config/env";
import type { NotificationQueuePort } from "../../application/ports/notification-queue.port";

export const NOTIFICATIONS_QUEUE_NAME = "notifications";

/**
 * A dedicated connection, not config/redis.ts's shared client — BullMQ
 * requires `maxRetriesPerRequest: null` on any connection it manages
 * blocking commands over (its own documented constraint), which conflicts
 * with the shared client's `maxRetriesPerRequest: 3` (ADR-017's own
 * hot-path retry posture for everything else Redis is used for here).
 * worker.ts creates its own copy of this same connection shape for the
 * same reason, since a Worker and a Queue are separate BullMQ clients.
 */
export const notificationQueueConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const queue = new Queue(NOTIFICATIONS_QUEUE_NAME, { connection: notificationQueueConnection });

/**
 * `jobId: notificationId` gives BullMQ's own queue a second, coarser layer
 * of de-dup (refusing to add another job under the same id while one is
 * still queued/active) on top of ProcessNotificationJobUseCase's own
 * PENDING-status check, which is the real idempotency guarantee — this is
 * belt-and-suspenders, not load-bearing on its own (BullMQ allows re-adding
 * the same jobId once a prior one has completed).
 */
export class BullMqNotificationQueue implements NotificationQueuePort {
  async enqueue(notificationId: string): Promise<void> {
    await queue.add(
      "send",
      { notificationId },
      {
        jobId: notificationId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        // Bounded trail of failed jobs kept for inspection instead of growing Redis forever.
        removeOnFail: 1000,
      },
    );
  }
}
