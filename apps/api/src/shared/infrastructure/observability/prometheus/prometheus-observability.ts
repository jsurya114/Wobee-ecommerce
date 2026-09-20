import { logError } from "../../../logger";
import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  OTHER_WEBHOOK_EVENT_TYPE,
  type KnownWebhookEventType,
  type ObservabilityPort,
  type OrderLifecycleEvent,
  type OrderPaymentMethod,
  type OutcomeResult,
  type WebhookEventTypeLabel,
  type WebhookResult,
} from "../../../application/ports/observability.port";
import { metrics as defaultMetrics, type Metrics } from "./metrics";

/**
 * The concrete `@prometheus-io/client` implementation of ObservabilityPort.
 * Only composition roots (`*.module.ts` files) import this — use-cases
 * depend on the `ObservabilityPort` interface only (see that file).
 *
 * Every method is wrapped in try/catch and never rethrows: a metrics-library
 * bug or an unexpected label value must degrade to "this one data point is
 * missing," never to a failed checkout, webhook, or refund. The client's
 * label validation throws synchronously on a bad call, which is exactly the
 * class of error this guards against.
 */

const KNOWN_EVENTS: ReadonlySet<string> = new Set(KNOWN_WEBHOOK_EVENT_TYPES);

/**
 * Raw webhook event string -> bounded label. Exact, case-sensitive membership in the allowlist
 * (no trimming, no normalising: "Payment.Captured" is not a Razorpay event and becomes "other").
 * `Set.has` is not affected by prototype keys such as "__proto__" or "constructor".
 */
export function webhookEventTypeLabel(raw: unknown): WebhookEventTypeLabel {
  return typeof raw === "string" && KNOWN_EVENTS.has(raw) ? (raw as KnownWebhookEventType) : OTHER_WEBHOOK_EVENT_TYPE;
}

export class PrometheusObservability implements ObservabilityPort {
  constructor(private readonly m: Metrics = defaultMetrics) {}

  recordOrderCreated(input: { paymentMethod: OrderPaymentMethod }): void {
    this.safely(() => this.m.ordersCreatedTotal.inc({ payment_method: input.paymentMethod }));
  }

  recordOrderEvent(input: { event: OrderLifecycleEvent }): void {
    this.safely(() => this.m.ordersEventTotal.inc({ event: input.event }));
  }

  recordRefundIssued(input: { result: OutcomeResult }): void {
    this.safely(() => this.m.refundsTotal.inc({ result: input.result }));
  }

  recordInventoryReservation(input: { result: OutcomeResult }): void {
    this.safely(() => this.m.inventoryReservationsTotal.inc({ result: input.result }));
  }

  recordPaymentWebhook(input: { eventType: string; result: WebhookResult; durationSeconds: number }): void {
    this.safely(() => {
      this.m.paymentWebhooksTotal.inc({ event_type: webhookEventTypeLabel(input.eventType), result: input.result });
      this.m.paymentWebhookDurationSeconds.observe({ result: input.result }, input.durationSeconds);
    });
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logError("observability_metric_write_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** The one production ObservabilityPort instance — composition roots import this, mirroring how they import any other concrete adapter (e.g. `new PaymentRepository()`). */
export const observability: ObservabilityPort = new PrometheusObservability();
