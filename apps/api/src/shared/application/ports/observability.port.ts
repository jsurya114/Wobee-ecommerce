/**
 * Cross-cutting observability seam (ADR-010-style boundary, new). Use-cases
 * depend on this interface only — never on `@prometheus-io/client` directly
 * — so the domain/application layer stays metrics-vendor-agnostic; the
 * Prometheus implementation lives in
 * shared/infrastructure/observability/prometheus/prometheus-observability.ts
 * and is wired in by each module's composition root, the same way a
 * repository or gateway port is.
 *
 * Every method here is fire-and-forget (`void`, never `Promise`): recording
 * a metric must never be something a caller has to await, retry, or let
 * fail a request over. The Prometheus implementation is responsible for
 * making every call here best-effort (never throws) — see that file's own
 * comment.
 *
 * Label vocabularies are deliberately closed unions, not `string` — the
 * only way to add a label value is to change this file, which is the
 * cardinality guardrail: nothing here accepts an order id, user id, email,
 * or any other unbounded identifier.
 */

export type OrderLifecycleEvent = "confirmed" | "cancelled" | "delivered" | "returned_to_origin" | "payment_failed";
export type OrderPaymentMethod = "online" | "cod";
export type OutcomeResult = "success" | "failure";
/**
 * The ONLY Razorpay webhook event names that may become a metric label. The event name arrives in a
 * (signature-verified, but still externally supplied) JSON payload, so a regex is not a cardinality
 * control — any string matching it would mint a new time series. Exactly these values map to
 * themselves; everything else maps to OTHER_WEBHOOK_EVENT_TYPE. Two are acted on by
 * HandleRazorpayWebhookUseCase; the rest are events this payments-only integration can plausibly
 * receive and deliberately acknowledges without acting ("ignored"). Adding an event here is a
 * reviewed, code-level decision (see metric-definitions.test.ts, which pins the resulting series count).
 */
export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "payment.captured",
  "payment.failed",
  "payment.authorized",
  "order.paid",
  "refund.created",
  "refund.processed",
  "refund.failed",
] as const;
export type KnownWebhookEventType = (typeof KNOWN_WEBHOOK_EVENT_TYPES)[number];
export const OTHER_WEBHOOK_EVENT_TYPE = "other";
export type WebhookEventTypeLabel = KnownWebhookEventType | typeof OTHER_WEBHOOK_EVENT_TYPE;
/** What the use-case passes in: the RAW event string from the payload. The metrics adapter, not the caller, maps it to a WebhookEventTypeLabel. */
export type RazorpayEventType = string;
export type WebhookResult = "processed" | "deduped" | "ignored" | "amount-mismatch" | "stale";

export interface ObservabilityPort {
  /** Call once, after the order row has committed inside CheckoutUseCase's transaction. */
  recordOrderCreated(input: { paymentMethod: OrderPaymentMethod }): void;

  /** Call once per lifecycle transition, only after the transition has actually committed (`changed: true`) — never speculatively before a transaction resolves. */
  recordOrderEvent(input: { event: OrderLifecycleEvent }): void;

  /** Only for a refund actually attempted against the gateway (a "not-applicable" outcome, e.g. COD, is not a refund attempt and must not be recorded). */
  recordRefundIssued(input: { result: OutcomeResult }): void;

  recordInventoryReservation(input: { result: OutcomeResult }): void;

  /** One call per webhook delivery, after HandleRazorpayWebhookUseCase has decided its outcome. */
  recordPaymentWebhook(input: { eventType: RazorpayEventType; result: WebhookResult; durationSeconds: number }): void;
}
