import { logError } from "../../../logger";
import type {
  ObservabilityPort,
  OrderLifecycleEvent,
  OrderPaymentMethod,
  OutcomeResult,
  WebhookResult,
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

/** Razorpay's event names look like `payment.captured` / `refund.processed` / `payment.dispute.won`. Anything else — including a value that would make the label unbounded — collapses to a single bucket. */
const RAZORPAY_EVENT_SHAPE = /^[a-z_]+(\.[a-z_]+){1,2}$/;
const MAX_EVENT_TYPE_LENGTH = 48;
export const UNKNOWN_EVENT_TYPE = "other";

export function sanitizeEventType(raw: unknown): string {
  return typeof raw === "string" && raw.length <= MAX_EVENT_TYPE_LENGTH && RAZORPAY_EVENT_SHAPE.test(raw) ? raw : UNKNOWN_EVENT_TYPE;
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
      this.m.paymentWebhooksTotal.inc({ event_type: sanitizeEventType(input.eventType), result: input.result });
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
