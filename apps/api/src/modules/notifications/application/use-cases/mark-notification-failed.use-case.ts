import type { NotificationRepositoryPort } from "../ports/notification-repository.port";

/**
 * The terminal-failure counterpart to ProcessNotificationJobUseCase's own
 * success path — called only by worker.ts (infrastructure), once BullMQ
 * itself has decided no further retry is coming (either a non-retryable
 * NotificationDeliveryError, or an ordinary one that's exhausted its
 * attempts). Kept as its own tiny use-case rather than the worker calling
 * the repository directly, matching this codebase's own convention of
 * "callers depend on use-cases, not raw repositories" even at a
 * composition root.
 */
export class MarkNotificationFailedUseCase {
  constructor(private readonly notificationRepository: NotificationRepositoryPort) {}

  execute(notificationId: string, lastError: string): Promise<void> {
    return this.notificationRepository.markFailed(notificationId, lastError);
  }
}
