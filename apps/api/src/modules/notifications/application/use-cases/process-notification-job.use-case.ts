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
 * Idempotent, and now genuinely so (Week 2 review fix, P1): BullMQ's "at
 * least once" delivery means this can run twice for one notification (a
 * retry after a successful send whose completion ack was lost, a stale job
 * re-processed after a crash, a second worker). The old check-then-send
 * left the row PENDING across the provider call, so a redelivery in that
 * window sent a second real email. Now an atomic `claimForSending`
 * (PENDING -> SENDING) is taken BEFORE the provider call — a lost race
 * returns false and this run does nothing; only the claim winner sends.
 * A retryable failure releases the claim so a genuine retry still works.
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
    // Terminal — nothing to do (a redelivered job for an already-resolved row).
    if (notification.status === "SENT" || notification.status === "FAILED") {
      return;
    }
    // Atomic claim. Lost the race (another worker/redelivery already claimed,
    // or it's mid-send) -> stop here so the provider is never called twice.
    const claimed = await this.notificationRepository.claimForSending(notification.id);
    if (!claimed) {
      return;
    }
    try {
      await this.notificationProvider.send(notification);
      await this.notificationRepository.markSent(notification.id);
    } catch (error) {
      // Hand the row back to PENDING so BullMQ's own retry can re-attempt a
      // transient failure. A terminal failure is recorded by the worker
      // (which alone knows "was this the last attempt") via markFailed.
      await this.notificationRepository.releaseClaim(notification.id);
      throw error;
    }
  }
}
