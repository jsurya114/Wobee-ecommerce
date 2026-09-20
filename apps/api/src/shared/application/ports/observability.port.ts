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
/** Razorpay's own event vocabulary (payment.captured, payment.failed, ...) — fixed and vendor-defined, not client input, so it is safe as a label. */
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
