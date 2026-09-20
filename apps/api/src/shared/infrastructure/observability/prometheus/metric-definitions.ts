import { Counter, Gauge, Histogram, type Registry } from "@prometheus-io/client";

/**
 * Every custom (non-default-Node.js) metric the API process exports, in one
 * place, so the full label/cardinality surface is reviewable without
 * hunting across use-cases. Each function takes the Registry to register
 * against — production code calls this once with the shared `registry`
 * (metrics-registry.ts); tests call it with a throwaway Registry so
 * assertions never leak state between test files or collide with the
 * production singleton (Registry does not allow registering the same
 * metric name twice).
 *
 * Bucket choices:
 *  - HTTP request duration: Prometheus's own default web/RPC bucket set
 *    (0.005s .. 10s) is a reasonable starting point for this app's actual
 *    request mix (JSON CRUD + a handful of heavier admin/report endpoints);
 *    not hand-tuned against production latency data yet (none exists — this
 *    is Phase 1's first deploy of any instrumentation at all), so the
 *    buckets are the client's own defaults rather than an invented set.
 *  - Payment webhook duration: HTTP-shaped work (network call to nothing —
 *    it's inbound — plus one DB transaction), same bucket set is adequate.
 */
export const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export interface Metrics {
  httpRequestsTotal: Counter<"method" | "route" | "status_code">;
  httpRequestDurationSeconds: Histogram<"method" | "route" | "status_code">;
  httpRequestsInFlight: Gauge<never>;

  ordersCreatedTotal: Counter<"payment_method">;
  ordersEventTotal: Counter<"event">;
  refundsTotal: Counter<"result">;
  inventoryReservationsTotal: Counter<"result">;
  paymentWebhooksTotal: Counter<"event_type" | "result">;
  paymentWebhookDurationSeconds: Histogram<"result">;
}

export function createMetrics(register: Registry): Metrics {
  return {
    // ---- HTTP RED (Rate / Errors / Duration) -------------------------------
    httpRequestsTotal: new Counter({
      name: "woobe_http_requests_total",
      help: "Total HTTP requests handled by the API, excluding /metrics, /health and /ready.",
      labelNames: ["method", "route", "status_code"],
      registers: [register],
    }),
    httpRequestDurationSeconds: new Histogram({
      name: "woobe_http_request_duration_seconds",
      help: "HTTP request duration in seconds, excluding /metrics, /health and /ready.",
      labelNames: ["method", "route", "status_code"],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [register],
    }),
    httpRequestsInFlight: new Gauge({
      name: "woobe_http_requests_in_flight",
      help: "HTTP requests currently being handled (excluding /metrics, /health and /ready).",
      registers: [register],
    }),

    // ---- Business metrics (small, deliberate set — see docs/deployment.md
    // "Observability" for exactly what was excluded and why) ----------------
    ordersCreatedTotal: new Counter({
      name: "woobe_orders_created_total",
      help: "Orders successfully created at checkout (after the checkout transaction commits).",
      labelNames: ["payment_method"],
      registers: [register],
    }),
    ordersEventTotal: new Counter({
      name: "woobe_orders_event_total",
      help: "Order lifecycle transitions that actually committed: confirmed, cancelled, delivered, returned_to_origin, payment_failed.",
      labelNames: ["event"],
      registers: [register],
    }),
    refundsTotal: new Counter({
      name: "woobe_refunds_total",
      help: "Refunds actually attempted against the Razorpay gateway (excludes not-applicable, e.g. COD orders with nothing to refund).",
      labelNames: ["result"],
      registers: [register],
    }),
    inventoryReservationsTotal: new Counter({
      name: "woobe_inventory_reservations_total",
      help: "Checkout inventory reservation attempts, by outcome.",
      labelNames: ["result"],
      registers: [register],
    }),
    paymentWebhooksTotal: new Counter({
      name: "woobe_payment_webhooks_total",
      help: "Razorpay webhook deliveries received, by Razorpay event type and processing result.",
      labelNames: ["event_type", "result"],
      registers: [register],
    }),
    paymentWebhookDurationSeconds: new Histogram({
      name: "woobe_payment_webhook_duration_seconds",
      help: "Time to process one Razorpay webhook delivery, from signature verification to the final result.",
      labelNames: ["result"],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [register],
    }),
  };
}
