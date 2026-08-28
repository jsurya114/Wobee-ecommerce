import { NotFoundError } from "../../../../shared/errors";
import type { NotificationProviderPort } from "../ports/notification-provider.port";
import type { NotificationRepositoryPort } from "../ports/notification-repository.port";

/**
 * One BullMQ job's worth of work (week2 (1).md §20's "worker" box) — reads
 * the notification back from Postgres by id (never trusts a payload carried
 * on the job itself, see NotificationQueuePort's own comment), attempts
 * delivery once, and either marks it SENT or re-throws whatever the
 * provider threw. Deliberately does NOT call `markFailed` itself and does
 * NOT know about BullMQ's attempts/backoff/UnrecoverableError — that's the
 * worker's own job (infrastructure), not this use-case's; re-throwing is
 * this layer's entire contract with "does this need a retry."
 *
 * Idempotent by construction, not by accident: BullMQ's own "at least
 * once" delivery means this can run twice for the same notification (a
 * retry after a successful send whose completion ack was lost, a stale
 * job re-processed after a crash) — already-SENT is treated as "nothing
 * to do," not re-sent, and an already-FAILED (terminal) row is left alone
 * too rather than re-attempted outside BullMQ's own retry window.
 */
export class ProcessNotificationJobUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepositoryPort,
    private readonly notificationProvider: NotificationProviderPort,
  ) {}

  async execute(notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findById(notificationId);
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }
    if (notification.status !== "PENDING") {
      return;
    }
    await this.notificationProvider.send(notification);
    await this.notificationRepository.markSent(notification.id);
  }
}
