/**
 * Thrown by a NotificationProviderPort implementation on a failed send.
 * `retryable` is the one thing the BullMQ-aware worker (infrastructure)
 * needs from an otherwise framework-agnostic application-layer failure —
 * true for a transient/provider-side problem (worth BullMQ's own
 * attempts/backoff), false for a permanent one (e.g. no contact info on
 * file — retrying changes nothing), which the worker maps to BullMQ's own
 * `UnrecoverableError` to stop retries immediately. Kept in `domain/`, not
 * `infrastructure/`, precisely so the application layer (ProcessNotificationJobUseCase)
 * can throw/catch it without knowing BullMQ exists.
 */
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}
