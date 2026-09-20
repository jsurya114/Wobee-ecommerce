import { Registry } from "@prometheus-io/client";
import { describe, expect, it } from "vitest";
import { createMetrics } from "./metric-definitions";
import { KNOWN_WEBHOOK_EVENT_TYPES, OTHER_WEBHOOK_EVENT_TYPE } from "../../../application/ports/observability.port";
import { PrometheusObservability, webhookEventTypeLabel } from "./prometheus-observability";

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

  it("maps EVERY allowlisted Razorpay event to itself", () => {
    expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("payment.captured");
    expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("payment.failed");
    for (const known of KNOWN_WEBHOOK_EVENT_TYPES) expect(webhookEventTypeLabel(known)).toBe(known);
  });

  it("maps an unknown event to exactly `other` — even one that LOOKS like a Razorpay event", () => {
    for (const unknown of ["payment.dispute.won", "subscription.charged", "payment.captured2", "payment.capturedX", "some.new_event"]) {
      expect(webhookEventTypeLabel(unknown), unknown).toBe(OTHER_WEBHOOK_EVENT_TYPE);
    }
  });

  it("maps empty, malformed, oversized, wrongly-cased and non-string values to `other`", () => {
    const junk: unknown[] = [
      "", " ", " payment.captured", "payment.captured ", "PAYMENT.CAPTURED", "Payment.Captured", "payment.captured\n", "payment.captured\u0000",
      "<script>alert(1)</script>", "payment.captured; DROP TABLE orders", "a".repeat(10_000), "nodots", "😀.😀",
      "__proto__", "constructor", "toString", "hasOwnProperty", undefined, null, 42, true, {}, [], ["payment.captured"], { toString: () => "payment.captured" },
    ];
    for (const value of junk) expect(webhookEventTypeLabel(value), JSON.stringify(value)).toBe(OTHER_WEBHOOK_EVENT_TYPE);
  });

  it("keeps event_type cardinality bounded no matter how many distinct strings arrive", async () => {
    const { registry, observability } = build();
    const results = ["processed", "deduped", "ignored", "amount-mismatch", "stale"] as const;
    for (let i = 0; i < 5_000; i++) {
      observability.recordPaymentWebhook({ eventType: `evt.${i}.${Math.random().toString(36).slice(2)}`, result: results[i % results.length]!, durationSeconds: 0.01 });
    }
    const series = (await registry.getMetricsAsJSON()).find((m) => m.name === "woobe_payment_webhooks_total")!.values as { labels: Record<string, string> }[];
    const eventTypes = new Set(series.map((v) => v.labels.event_type as string));
    expect(eventTypes.size).toBeLessThanOrEqual(KNOWN_WEBHOOK_EVENT_TYPES.length + 1);
    expect(series.length).toBeLessThanOrEqual((KNOWN_WEBHOOK_EVENT_TYPES.length + 1) * results.length);
    expect([...eventTypes].every((t) => t === OTHER_WEBHOOK_EVENT_TYPE || (KNOWN_WEBHOOK_EVENT_TYPES as readonly string[]).includes(t))).toBe(true);
    expect((await registry.metrics()).match(/evt\./g)).toBeNull(); // no raw payload string ever reached the exposition
  });

  it("records a known event under its own name and an unknown one under `other`", async () => {
    const { registry, observability } = build();
    observability.recordPaymentWebhook({ eventType: "payment.captured", result: "processed", durationSeconds: 0.1 });
    observability.recordPaymentWebhook({ eventType: "totally.unknown", result: "ignored", durationSeconds: 0.1 });
    const text = await registry.metrics();
    expect(text).toContain('woobe_payment_webhooks_total{event_type="payment.captured",result="processed"} 1');
    expect(text).toContain('woobe_payment_webhooks_total{event_type="other",result="ignored"} 1');
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
