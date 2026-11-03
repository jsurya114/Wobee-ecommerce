import { logError } from "../../../../shared/logger";
import type { NotificationQueuePort } from "../ports/notification-queue.port";
import type { NotificationRepositoryPort } from "../ports/notification-repository.port";

/** A PENDING row older than this has either lost its queue job (failed `queue.add`, Redis flush) or is badly backlogged. */
export const PENDING_RECOVERY_AGE_MS = 5 * 60 * 1000;
const BATCH = 200;

/**
 * Redis is disposable (ADR-017), so the notifications table is the source of truth. This re-adds a
 * queue job for every long-PENDING row. Safe to run repeatedly and from several processes: the job
 * id is the notification id (BullMQ ignores an add while that job still exists) and the worker's
 * atomic claim stops a double send.
 */
export class RecoverPendingNotificationsUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepositoryPort,
    private readonly notificationQueue: NotificationQueuePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<{ requeued: number }> {
    const cutoff = new Date(this.now().getTime() - PENDING_RECOVERY_AGE_MS);
    const pending = await this.notificationRepository.findPendingOlderThan(cutoff, BATCH);
    let requeued = 0;
    for (const notification of pending) {
      try {
        await this.notificationQueue.enqueue(notification.id);
        requeued += 1;
      } catch (error) {
        logError("notifications.recover_enqueue_failed", { notificationId: notification.id, error });
      }
    }
    return { requeued };
  }
}
