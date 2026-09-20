import http from "node:http";
import type { AddressInfo } from "node:net";
import { Registry } from "@prometheus-io/client";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMetrics } from "./metric-definitions";
import { createHttpMetricsMiddleware } from "./http-metrics.middleware";

/**
 * Real Express + real HTTP sockets (no mocked req/res): the behaviors that
 * matter here — Express's baseUrl bookkeeping on the error path, `close`
 * without `finish` on an aborted connection — only exist in the real thing.
 */
const registry = new Registry();
const metrics = createMetrics(registry);
let server: http.Server;
let port: number;
let releaseSlowRoute: (() => void) | undefined;

beforeAll(async () => {
  const app = express();
  app.use(createHttpMetricsMiddleware(metrics));

  // A middleware that rejects BEFORE any route matches (the way malformed-JSON / CORS / body-limit rejections do).
  app.use((req, res, next) => {
    if (req.headers["x-reject-early"]) {
      res.status(400).json({ error: "rejected before routing" });
      return;
    }
    next();
  });

  const orders = express.Router();
  orders.get("/", (_req, res) => void res.json({ list: true }));
  orders.get("/:id", (req, res) => void res.json({ id: req.params.id }));
  orders.get("/:id/boom", (_req, _res, next) => next(new Error("boom")));
  orders.get("/:id/slow", (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 60);
  });
  orders.get("/:id/hang", (_req, res) => {
    releaseSlowRoute = () => res.end();
  });
  app.use("/api/v1/orders", orders);
  app.get(/^\/regex-route\/\d+$/, (_req, res) => void res.json({ ok: true }));
  app.get("/health", (_req, res) => void res.json({ status: "ok" }));
  app.get("/ready", (_req, res) => void res.json({ status: "ready" }));
  app.get("/metrics", (_req, res) => void res.end("metrics"));
  app.use((_req, res) => void res.status(404).json({ error: "nope" }));
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "internal" });
  });

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function get(path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path, headers }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      })
      .on("error", reject);
  });
}

async function series(name: string): Promise<{ labels: Record<string, string | number>; value: number }[]> {
  const all = await registry.getMetricsAsJSON();
  return (all.find((m) => m.name === name)?.values ?? []) as { labels: Record<string, string | number>; value: number }[];
}

async function requestCount(labels: { method: string; route: string; status_code: string }): Promise<number> {
  const found = (await series("woobe_http_requests_total")).find(
    (s) => s.labels.method === labels.method && s.labels.route === labels.route && s.labels.status_code === labels.status_code,
  );
  return found?.value ?? 0;
}

async function inFlight(): Promise<number> {
  return (await series("woobe_http_requests_in_flight"))[0]?.value ?? 0;
}

async function eventually<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("httpMetricsMiddleware", () => {
  it("labels by method, ROUTE TEMPLATE and status — never the raw id", async () => {
    await get("/api/v1/orders/8f1c2e9a-aaaa-bbbb-cccc-111122223333");
    await get("/api/v1/orders/another-id-entirely");

    expect(await requestCount({ method: "GET", route: "/api/v1/orders/:id", status_code: "200" })).toBe(2);
    const routes = (await series("woobe_http_requests_total")).map((s) => String(s.labels.route));
    expect(routes.join("|")).not.toMatch(/8f1c2e9a|another-id-entirely/);
  });

  it("never puts query parameters into a label", async () => {
    await get("/api/v1/orders/q1?email=victim@example.com&token=secret123");
    const text = await registry.metrics();
    expect(text).not.toContain("victim@example.com");
    expect(text).not.toContain("secret123");
    expect(text).not.toContain("email=");
  });

  it("keeps the FULL mounted route template on the error path (Express restores baseUrl on next(err))", async () => {
    const status = await get("/api/v1/orders/x1/boom");
    expect(status).toBe(500);
    expect(await requestCount({ method: "GET", route: "/api/v1/orders/:id/boom", status_code: "500" })).toBe(1);
    // The pre-fix behavior labelled this "/:id/boom" — make sure that series never exists.
    expect((await series("woobe_http_requests_total")).some((s) => s.labels.route === "/:id/boom")).toBe(false);
  });

  it("maps an unmatched request to the fixed NOT_FOUND route, never the raw path", async () => {
    const status = await get("/totally/unknown/path-with-secret-abc123");
    expect(status).toBe(404);
    expect(await requestCount({ method: "GET", route: "NOT_FOUND", status_code: "404" })).toBe(1);
    expect(await registry.metrics()).not.toContain("secret-abc123");
  });

  it("labels a request rejected BEFORE routing as UNMATCHED (not NOT_FOUND) — a 400 must never read as \"not found\"", async () => {
    expect(await get("/api/v1/orders/anything-at-all", { "x-reject-early": "1" })).toBe(400);
    expect(await requestCount({ method: "GET", route: "UNMATCHED", status_code: "400" })).toBe(1);
    expect(await requestCount({ method: "GET", route: "NOT_FOUND", status_code: "400" })).toBe(0);
  });

  it("normalizes a mounted router's \"/\" route: no trailing slash in the template", async () => {
    await get("/api/v1/orders");
    expect(await requestCount({ method: "GET", route: "/api/v1/orders", status_code: "200" })).toBe(1);
    expect((await series("woobe_http_requests_total")).some((s) => s.labels.route === "/api/v1/orders/")).toBe(false);
  });

  it("uses a bounded fixed value for a route registered with a RegExp path", async () => {
    await get("/regex-route/42");
    expect(await requestCount({ method: "GET", route: "UNKNOWN_ROUTE", status_code: "200" })).toBe(1);
  });

  it("does not record /metrics, /health or /ready", async () => {
    const before = (await series("woobe_http_requests_total")).length;
    await get("/health");
    await get("/ready");
    await get("/metrics");
    await get("/METRICS");
    await get("/Metrics/");
    await get("/HEALTH/");
    const routes = (await series("woobe_http_requests_total")).map((s) => s.labels.route);
    expect((await series("woobe_http_requests_total")).length).toBe(before);
    expect(routes).not.toContain("/health");
    expect(routes).not.toContain("/ready");
    expect(routes).not.toContain("/metrics");
  });

  it("observes a positive duration in the histogram", async () => {
    await get("/api/v1/orders/s1/slow");
    const sum = (await series("woobe_http_request_duration_seconds")).find(
      (s) => (s as { metricName?: string }).metricName === "woobe_http_request_duration_seconds_sum" && s.labels.route === "/api/v1/orders/:id/slow",
    );
    const count = (await series("woobe_http_request_duration_seconds")).find(
      (s) => (s as { metricName?: string }).metricName === "woobe_http_request_duration_seconds_count" && s.labels.route === "/api/v1/orders/:id/slow",
    );
    expect(count?.value).toBe(1);
    expect(sum?.value).toBeGreaterThanOrEqual(0.05); // the route waits 60ms
    expect(sum?.value).toBeLessThan(5);
  });

  it("returns the in-flight gauge to its previous value after normal requests", async () => {
    const before = await inFlight();
    await Promise.all([get("/api/v1/orders/a"), get("/api/v1/orders/b"), get("/api/v1/orders/c/slow")]);
    expect(await eventually(inFlight, (v) => v === before)).toBe(before);
  });

  it("releases the in-flight slot exactly once when the client aborts mid-request, and does not count it as a completed request", async () => {
    const before = await inFlight();
    const completedBefore = (await series("woobe_http_requests_total")).reduce((sum, s) => sum + s.value, 0);

    const req = http.get({ host: "127.0.0.1", port, path: "/api/v1/orders/h1/hang" });
    req.on("error", () => undefined);
    expect(await eventually(inFlight, (v) => v === before + 1)).toBe(before + 1);

    req.destroy(); // client disconnects: `close` fires, `finish` never does
    expect(await eventually(inFlight, (v) => v === before)).toBe(before);
    releaseSlowRoute?.(); // late server-side end() must not double-decrement
    await new Promise((r) => setTimeout(r, 50));
    expect(await inFlight()).toBe(before);

    const completedAfter = (await series("woobe_http_requests_total")).reduce((sum, s) => sum + s.value, 0);
    expect(completedAfter).toBe(completedBefore);
  });
});
