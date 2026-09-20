import type { NextFunction, Request, Response } from "express";
import { metrics as defaultMetrics, type Metrics } from "./metrics";

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
 * is a deliberate policy decision, not an oversight — see docs/observability.md
 * ("What HTTP metrics exclude").
 *
 * Route label: the Express ROUTE TEMPLATE (`req.baseUrl + req.route.path`),
 * never `req.path`/`req.originalUrl` — this is what keeps a label like
 * `/api/v1/orders/:id` bounded no matter how many distinct order ids are
 * requested. An unmatched request (`req.route` is never set — the
 * `notFoundHandler` in app.ts runs, or an earlier middleware rejected it)
 * maps to a fixed value — `NOT_FOUND` for a 404, `UNMATCHED` otherwise —
 * never the raw unmatched path (which could contain anything a client sent,
 * including secrets accidentally put in a URL).
 *
 * WHY THE TEMPLATE IS CAPTURED AT MATCH TIME, NOT AT `finish`: Express
 * restores `req.baseUrl` to the parent's value as soon as a handler calls
 * `next(err)` and control leaves the mounted router — by the time the error
 * handler has written a 4xx/5xx and `finish` fires, `req.baseUrl` is `""`
 * while `req.route` still holds the last matched route. Reading both at
 * `finish` would therefore label every error response `/:id` instead of
 * `/api/v1/orders/:id` — wrong, and colliding across modules, on exactly the
 * responses this dashboard exists to surface. Express assigns `req.route`
 * at the moment a route layer matches (when `baseUrl` is still correct), so
 * an accessor on `req.route` records the full template right then.
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

/** Express routes are case-insensitive and ignore a trailing slash, so the exclusion must too — otherwise `/METRICS/` would be counted as ordinary traffic. */
function isExcluded(path: string): boolean {
  return EXCLUDED_PATHS.has(path.toLowerCase().replace(/\/+$/, ""));
}

/**
 * `req.method` is client-supplied. Node's HTTP parser already rejects methods it does not know, but the
 * label's bound should not depend on that: only standard methods pass through; anything else is "OTHER".
 */
const KNOWN_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"]);
export function methodLabel(method: string): string {
  return KNOWN_METHODS.has(method) ? method : "OTHER";
}

/** A route registered with a RegExp/array path has no single template; a fixed bounded value beats leaking regex source or joined arrays. */
const UNTEMPLATED_ROUTE = "UNKNOWN_ROUTE";
/** No route ever matched. 404 = an unknown path; anything else = rejected before routing (malformed JSON 400, oversized body 413, CORS...). Separate values so a parse error never reads as "not found". */
const NOT_FOUND_ROUTE = "NOT_FOUND";
const UNMATCHED_ROUTE = "UNMATCHED";

/** `/api/v1/products/` and `/api/v1/products` are one route; a mounted router's "/" route would otherwise carry a trailing slash. */
function normalizeTemplate(template: string): string {
  return template.length > 1 ? template.replace(/\/+$/, "") || "/" : template;
}

export function createHttpMetricsMiddleware(metrics: Pick<Metrics, "httpRequestsTotal" | "httpRequestDurationSeconds" | "httpRequestsInFlight">) {
  return function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (isExcluded(req.path)) {
      next();
      return;
    }

    let routeTemplate: string | undefined;
    let currentRoute: unknown;
    Object.defineProperty(req, "route", {
      configurable: true,
      enumerable: true,
      get: () => currentRoute,
      set: (value: unknown) => {
        currentRoute = value;
        const path = (value as { path?: unknown } | undefined)?.path;
        routeTemplate = typeof path === "string" ? normalizeTemplate(`${req.baseUrl}${path}`) : UNTEMPLATED_ROUTE;
      },
    });

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
      try {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        const route = routeTemplate ?? (res.statusCode === 404 ? NOT_FOUND_ROUTE : UNMATCHED_ROUTE);
        const labels = { method: methodLabel(req.method), route, status_code: String(res.statusCode) };
        metrics.httpRequestsTotal.inc(labels);
        metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
      } catch {
        // Best-effort: a metrics failure must never affect the response that already went out.
      }
      release();
    };

    res.once("finish", onFinish);
    res.once("close", release);
    next();
  };
}

/** The production middleware, bound to the process-wide Metrics instance. */
export const httpMetricsMiddleware = createHttpMetricsMiddleware(defaultMetrics);
