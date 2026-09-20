import type { Request, Response } from "express";
import type { Registry } from "@prometheus-io/client";
import { registry as defaultRegistry } from "./metrics-registry";

/**
 * GET /metrics — Prometheus text exposition format, content type from the
 * registry itself (never hardcoded, so an OpenMetrics switch would need no
 * change here). Reads only in-process metric state; never queries Postgres
 * or Redis to build this response (constraint: no per-scrape DB query) and
 * never includes request bodies, cookies, tokens, or Authorization headers
 * — those never enter a metric label anywhere in this codebase (see
 * observability.port.ts's closed label unions).
 *
 * Kept internal by TWO independent layers, not by anything in this file:
 * (1) the API binds to 127.0.0.1 in production (API_BIND_HOST), so nothing
 * off-box can reach it directly; (2) nginx's catch-all `location /` would
 * otherwise proxy `/metrics` through to the public internet exactly like
 * any other API route (Cloudflare -> nginx -> API), so
 * infra/terraform/modules/ec2/templates/nginx/api.conf.tpl has a case-insensitive
 * regex `location ~* ^/metrics(/|$) { return 403; }` (an exact-match location
 * would miss `/Metrics` and `/metrics/`, which Express also serves) — this route is reached only by
 * Prometheus, which runs on the same EC2 host and scrapes
 * `http://127.0.0.1:${API_PORT}/metrics` directly, never through nginx at
 * all. See modules/ec2/tests/run-nginx-tests.sh, which renders the real
 * template into a real nginx and asserts every /metrics spelling is denied
 * through it.
 */

/**
 * Second layer, independent of nginx's path matching: a request that came THROUGH the proxy is
 * never served the metrics. nginx overwrites X-Forwarded-For on every proxied request (and adds
 * X-Forwarded-Host/Proto), so those headers are present on anything that traversed it — a client
 * cannot remove them — and absent on Prometheus's direct scrape of 127.0.0.1. `Forwarded` (RFC 7239)
 * is included for a CDN/proxy that uses the standard header instead.
 */
const PROXIED_REQUEST_HEADERS = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "cf-connecting-ip"] as const;

export function isProxiedRequest(headers: Request["headers"]): boolean {
  return PROXIED_REQUEST_HEADERS.some((name) => headers[name] !== undefined);
}

export function createMetricsHandler(registry: Registry = defaultRegistry) {
  return async function metricsHandler(req: Request, res: Response): Promise<void> {
    if (isProxiedRequest(req.headers)) {
      res.status(404).end(); // indistinguishable from "no such route" — do not confirm the endpoint exists
      return;
    }
    res.setHeader("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  };
}

export const metricsHandler = createMetricsHandler();
