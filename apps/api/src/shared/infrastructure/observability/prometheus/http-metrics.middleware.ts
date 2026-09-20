import type { NextFunction, Request, Response } from "express";
import { metrics } from "./metrics";

/**
 * RED (Rate/Errors/Duration) instrumentation for every Express route.
 *
 * Excluded entirely (never incremented, never timed): `/metrics` itself
 * (scraping the scrape endpoint would be circular and would also let scrape
 * frequency pollute the user-facing request-rate dashboard), and `/health`
 * + `/ready` (uptime/liveness/readiness probes — nginx's own healthchecks
 * hit these every few seconds with `access_log off` for the same reason;
 * counting them here would dilute `woobe_http_requests_total`'s rate() with
 * monitoring traffic that says nothing about real user/API traffic). This
 * is a deliberate policy decision, not an oversight — see docs/deployment.md
 * ("Observability" → "What HTTP metrics exclude").
 *
 * Route label: the Express ROUTE TEMPLATE (`req.baseUrl + req.route.path`),
 * never `req.path`/`req.originalUrl` — this is what keeps a label like
 * `/api/v1/orders/:id` bounded no matter how many distinct order ids are
 * requested. An unmatched request (`req.route` is never set — the
 * `notFoundHandler` in app.ts runs, not a route) maps to the fixed value
 * `NOT_FOUND`, never the raw unmatched path (which could contain anything a
 * client sent, including secrets accidentally put in a URL).
 *
 * In-flight gauge: incremented before `next()`, decremented exactly once —
 * guarded by `settled` so `finish` and `close` (which both fire on a normal
 * completion) can never double-decrement, and so an aborted connection
 * (`close` without `finish`) still releases its slot instead of leaking it
 * forever. An aborted request has no valid final status code to attribute a
 * duration/outcome to, so it deliberately is NOT counted in
 * `httpRequestsTotal`/`httpRequestDurationSeconds` — only in-flight is
 * released for it.
 */
const EXCLUDED_PATHS = new Set(["/metrics", "/health", "/ready"]);

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (EXCLUDED_PATHS.has(req.path)) {
    next();
    return;
  }

  metrics.httpRequestsInFlight.inc();
  const startedAt = process.hrtime.bigint();
  let settled = false;

  const release = (): void => {
    if (settled) return;
    settled = true;
    metrics.httpRequestsInFlight.dec();
  };

  const onFinish = (): void => {
    if (settled) return;
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = req.route ? `${req.baseUrl}${req.route.path as string}` : "NOT_FOUND";
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    release();
  };

  res.once("finish", onFinish);
  res.once("close", release);
  next();
}
