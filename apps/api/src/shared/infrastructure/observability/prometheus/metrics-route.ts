import type { Request, Response } from "express";
import { registry } from "./metrics-registry";

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
 * infra/terraform/modules/ec2/templates/nginx/api.conf.tpl has an explicit
 * `location = /metrics { return 403; }` BEFORE that catch-all — this route
 * is reached only by Prometheus, which runs on the same EC2 host and
 * scrapes `http://127.0.0.1:${API_PORT}/metrics` directly, never through
 * nginx at all. See nginx-monitoring-exposure.test.ts, which renders the
 * real template and asserts both that the deny block exists and that it is
 * ordered before the catch-all (nginx uses the first matching `location`).
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}
