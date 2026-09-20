import { Registry } from "@prometheus-io/client";
import { describe, expect, it } from "vitest";
import { createMetrics } from "./metric-definitions";
import { PrometheusObservability, sanitizeEventType, UNKNOWN_EVENT_TYPE } from "./prometheus-observability";

function build() {
  const registry = new Registry();
  const metrics = createMetrics(registry);
  return { registry, metrics, observability: new PrometheusObservability(metrics) };
}

describe("PrometheusObservability", () => {
  it("maps each port method onto exactly its metric", async () => {
    const { registry, observability } = build();

    observability.recordOrderCreated({ paymentMethod: "cod" });
    observability.recordOrderEvent({ event: "confirmed" });
    observability.recordOrderEvent({ event: "returned_to_origin" });
    observability.recordRefundIssued({ result: "failure" });
    observability.recordInventoryReservation({ result: "success" });
    observability.recordPaymentWebhook({ eventType: "payment.captured", result: "processed", durationSeconds: 0.12 });

    const text = await registry.metrics();
    expect(text).toContain('woobe_orders_created_total{payment_method="cod"} 1');
    expect(text).toContain('woobe_orders_event_total{event="confirmed"} 1');
    expect(text).toContain('woobe_orders_event_total{event="returned_to_origin"} 1');
    expect(text).toContain('woobe_refunds_total{result="failure"} 1');
    expect(text).toContain('woobe_inventory_reservations_total{result="success"} 1');
    expect(text).toContain('woobe_payment_webhooks_total{event_type="payment.captured",result="processed"} 1');
    expect(text).toContain('woobe_payment_webhook_duration_seconds_count{result="processed"} 1');
  });

  it("collapses a non-Razorpay-shaped event type into a single bounded bucket", async () => {
    const { registry, observability } = build();
    for (const forged of ["<script>", "payment.captured; DROP TABLE", "a".repeat(200), "", "UPPER.case", "pay ment.x"]) {
      observability.recordPaymentWebhook({ eventType: forged, result: "ignored", durationSeconds: 0.01 });
    }
    const text = await registry.metrics();
    expect(text).toContain(`woobe_payment_webhooks_total{event_type="${UNKNOWN_EVENT_TYPE}",result="ignored"} 6`);
    expect(text).not.toContain("script");
    expect(text).not.toContain("DROP");
  });

  it("sanitizeEventType keeps real Razorpay event names and rejects everything else", () => {
    for (const ok of ["payment.captured", "payment.failed", "refund.processed", "payment.dispute.won", "order.paid"]) {
      expect(sanitizeEventType(ok)).toBe(ok);
    }
    for (const bad of [undefined, null, 42, {}, "nodots", "a.b.c.d", "x".repeat(60) + ".y"]) {
      expect(sanitizeEventType(bad)).toBe(UNKNOWN_EVENT_TYPE);
    }
  });

  it("NEVER throws into the caller if the metrics library throws — a business operation must survive a metrics failure", () => {
    const exploding = new Proxy(
      {},
      {
        get: () => ({
          inc: () => {
            throw new Error("metrics broke");
          },
          observe: () => {
            throw new Error("metrics broke");
          },
        }),
      },
    ) as never;
    const observability = new PrometheusObservability(exploding);

    expect(() => observability.recordOrderCreated({ paymentMethod: "online" })).not.toThrow();
    expect(() => observability.recordOrderEvent({ event: "cancelled" })).not.toThrow();
    expect(() => observability.recordRefundIssued({ result: "success" })).not.toThrow();
    expect(() => observability.recordInventoryReservation({ result: "failure" })).not.toThrow();
    expect(() => observability.recordPaymentWebhook({ eventType: "payment.failed", result: "stale", durationSeconds: 1 })).not.toThrow();
  });

  it("does not throw on a label value the metric rejects (bad input degrades to a missing data point)", () => {
    const { observability } = build();
    expect(() => observability.recordOrderCreated({ paymentMethod: undefined as never })).not.toThrow();
  });
});
