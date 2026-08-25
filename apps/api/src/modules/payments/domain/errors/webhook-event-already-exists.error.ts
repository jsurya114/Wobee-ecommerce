/**
 * Internal signal only — never reaches a controller/HTTP response. Thrown
 * by WebhookEventRepositoryPort.create() when the `(provider, eventId)`
 * unique constraint fires (ADR-014): two concurrent deliveries of the same
 * event raced on creating the dedup row. The use-case re-reads and either
 * defers to whichever delivery is already finished, or safely reprocesses
 * (every downstream effect is itself idempotent — see
 * HandleRazorpayWebhookUseCase's own comment).
 */
export class WebhookEventAlreadyExistsError extends Error {
  constructor() {
    super("Webhook event already exists");
    this.name = "WebhookEventAlreadyExistsError";
  }
}
