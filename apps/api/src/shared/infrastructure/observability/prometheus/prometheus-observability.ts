import { logError } from "../../../logger";
import type { ObservabilityPort } from "../../../application/ports/observability.port";
import { metrics } from "./metrics";

/**
 * The concrete `@prometheus-io/client` implementation of ObservabilityPort.
 * Only composition roots (`*.module.ts` files) import this — use-cases
 * depend on the `ObservabilityPort` interface only (see that file).
 *
 * Every method is wrapped in try/catch and never rethrows: constraint #13/
 * #14 from the brief ("metrics must never be able to break a successful
 * business operation" / "collection is best-effort") — a metrics-library
 * bug or an unexpected label value must degrade to "this one data point is
 * missing," never to a failed checkout, webhook, or refund. `prom-client`'s
 * label validation throws synchronously on a bad call, which is exactly the
 * class of error this guards against.
 */
export class PrometheusObservability implements ObservabilityPort {
  recordOrderCreated(input: { paymentMethod: "online" | "cod" }): void {
    this.safely(() => metrics.ordersCreatedTotal.inc({ payment_method: input.paymentMethod }));
  }

  recordOrderEvent(input: { event: "confirmed" | "cancelled" | "delivered" | "returned_to_origin" | "payment_failed" }): void {
    this.safely(() => metrics.ordersEventTotal.inc({ event: input.event }));
  }

  recordRefundIssued(input: { result: "success" | "failure" }): void {
    this.safely(() => metrics.refundsTotal.inc({ result: input.result }));
  }

  recordInventoryReservation(input: { result: "success" | "failure" }): void {
    this.safely(() => metrics.inventoryReservationsTotal.inc({ result: input.result }));
  }

  recordPaymentWebhook(input: { eventType: string; result: string; durationSeconds: number }): void {
    this.safely(() => {
      metrics.paymentWebhooksTotal.inc({ event_type: input.eventType, result: input.result });
      metrics.paymentWebhookDurationSeconds.observe({ result: input.result }, input.durationSeconds);
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
