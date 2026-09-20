import { Registry } from "@prometheus-io/client";
import { describe, expect, it } from "vitest";
import { createMetrics } from "./metric-definitions";

/**
 * The cardinality contract, executable. If a new metric or label is added
 * to metric-definitions.ts, this file must be edited on purpose: the two
 * tables below ARE the reviewed label surface of the API process.
 */
const EXPECTED: Record<string, { type: "counter" | "gauge" | "histogram"; labels: string[] }> = {
  woobe_http_requests_total: { type: "counter", labels: ["method", "route", "status_code"] },
  woobe_http_request_duration_seconds: { type: "histogram", labels: ["method", "route", "status_code"] },
  woobe_http_requests_in_flight: { type: "gauge", labels: [] },
  woobe_orders_created_total: { type: "counter", labels: ["payment_method"] },
  woobe_orders_event_total: { type: "counter", labels: ["event"] },
  woobe_refunds_total: { type: "counter", labels: ["result"] },
  woobe_inventory_reservations_total: { type: "counter", labels: ["result"] },
  woobe_payment_webhooks_total: { type: "counter", labels: ["event_type", "result"] },
  woobe_payment_webhook_duration_seconds: { type: "histogram", labels: ["result"] },
};

const FORBIDDEN_LABELS = [
  "user_id", "userid", "customer_id", "order_id", "orderid", "product_id", "variant_id", "payment_id",
  "request_id", "id", "uuid", "email", "phone", "ip", "ip_address", "url", "path", "query", "user_agent", "token", "session",
];

describe("createMetrics", () => {
  it("exports exactly the reviewed set of metrics, with the reviewed type and labels", async () => {
    const registry = new Registry();
    createMetrics(registry);
    const exported = await registry.getMetricsAsJSON();

    expect(exported.map((m) => m.name).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const metric of exported) {
      expect(metric.type, metric.name).toBe(EXPECTED[metric.name]!.type);
    }
  });

  it("declares exactly the reviewed label names on every metric, none of them identifier-shaped", () => {
    const registry = new Registry();
    const metrics = createMetrics(registry);
    const byName: Record<string, unknown> = {
      woobe_http_requests_total: metrics.httpRequestsTotal,
      woobe_http_request_duration_seconds: metrics.httpRequestDurationSeconds,
      woobe_http_requests_in_flight: metrics.httpRequestsInFlight,
      woobe_orders_created_total: metrics.ordersCreatedTotal,
      woobe_orders_event_total: metrics.ordersEventTotal,
      woobe_refunds_total: metrics.refundsTotal,
      woobe_inventory_reservations_total: metrics.inventoryReservationsTotal,
      woobe_payment_webhooks_total: metrics.paymentWebhooksTotal,
      woobe_payment_webhook_duration_seconds: metrics.paymentWebhookDurationSeconds,
    };
    for (const [name, spec] of Object.entries(EXPECTED)) {
      const labelNames = (byName[name] as { labelNames?: string[] }).labelNames ?? [];
      expect([...labelNames].sort(), name).toEqual([...spec.labels].sort());
      for (const label of labelNames) {
        expect(FORBIDDEN_LABELS, `${name} label "${label}"`).not.toContain(label.toLowerCase());
      }
    }
  });

  it("counters increment, gauges go up and down, histograms observe", async () => {
    const registry = new Registry();
    const m = createMetrics(registry);

    m.ordersCreatedTotal.inc({ payment_method: "cod" });
    m.ordersCreatedTotal.inc({ payment_method: "cod" });
    m.ordersCreatedTotal.inc({ payment_method: "online" });
    m.httpRequestsInFlight.inc();
    m.httpRequestsInFlight.inc();
    m.httpRequestsInFlight.dec();
    m.httpRequestDurationSeconds.observe({ method: "GET", route: "/x", status_code: "200" }, 0.2);

    const text = await registry.metrics();
    expect(text).toContain('woobe_orders_created_total{payment_method="cod"} 2');
    expect(text).toContain('woobe_orders_created_total{payment_method="online"} 1');
    expect(text).toContain("woobe_http_requests_in_flight 1");
    expect(text).toContain('woobe_http_request_duration_seconds_count{method="GET",route="/x",status_code="200"} 1');
    expect(text).toContain('woobe_http_request_duration_seconds_sum{method="GET",route="/x",status_code="200"} 0.2');
  });

  it("uses an explicit registry: two instances never share state", async () => {
    const a = new Registry();
    const b = new Registry();
    createMetrics(a).refundsTotal.inc({ result: "success" });
    createMetrics(b);
    expect(await a.metrics()).toContain('woobe_refunds_total{result="success"} 1');
    expect(await b.metrics()).toContain('woobe_refunds_total{result="success"} 0'); // b's own series, untouched by a
  });

  it("pre-creates every bounded business series at 0 so the first event is visible to rate()/increase()", async () => {
    const registry = new Registry();
    createMetrics(registry);
    const text = await registry.metrics();
    for (const line of [
      'woobe_orders_created_total{payment_method="online"} 0',
      'woobe_orders_created_total{payment_method="cod"} 0',
      'woobe_orders_event_total{event="confirmed"} 0',
      'woobe_orders_event_total{event="returned_to_origin"} 0',
      'woobe_refunds_total{result="failure"} 0',
      'woobe_inventory_reservations_total{result="failure"} 0',
      'woobe_payment_webhooks_total{event_type="payment.captured",result="deduped"} 0',
      'woobe_payment_webhook_duration_seconds_count{result="processed"} 0',
    ]) {
      expect(text, line).toContain(line);
    }
  });

  it("does NOT pre-create the unbounded HTTP series (routes are dynamic)", async () => {
    const registry = new Registry();
    createMetrics(registry);
    const text = await registry.metrics();
    expect(text).not.toMatch(/^woobe_http_requests_total\{/m);
  });

  it("rejects a label the metric was not declared with (a typo or an identifier cannot slip in silently)", () => {
    const m = createMetrics(new Registry());
    expect(() => m.ordersCreatedTotal.inc({ order_id: "abc" } as never)).toThrow();
  });
});
