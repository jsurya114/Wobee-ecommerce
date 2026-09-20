import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { resolveTrustProxyHops } from "./config/trust-proxy";
import { redis } from "./config/redis";
import { errorHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";

/**
 * Scope of the forwarded-header protection.
 *
 * Production traffic is Cloudflare -> nginx -> API, and nginx ALWAYS adds X-Forwarded-For / -Host / -Proto and
 * X-Real-IP (and passes Cloudflare's CF-Connecting-IP through). So those headers are present on EVERY legitimate
 * request. The rule is therefore deliberately narrow:
 *   - it exists ONLY inside the /metrics handler (a scrape comes straight from Prometheus on loopback and never
 *     carries them, so anything that has been through a proxy is by definition not Prometheus);
 *   - it must never touch any other route.
 * These tests pin both halves, so a future "make it a global middleware" change fails loudly.
 */
const app = createApp();

/** What nginx (templates/nginx/api.conf.tpl) + Cloudflare put on a legitimate request. */
const PROXY_HEADERS = {
  "X-Forwarded-For": "203.0.113.9",
  "X-Forwarded-Proto": "https",
  "X-Forwarded-Host": "api.woobe.in",
  "X-Real-IP": "203.0.113.9",
  "CF-Connecting-IP": "203.0.113.9",
  Forwarded: "for=203.0.113.9;proto=https",
} as const;

function withProxyHeaders(req: request.Test): request.Test {
  for (const [name, value] of Object.entries(PROXY_HEADERS)) req.set(name, value);
  return req;
}

describe("proxied (legitimate) traffic is unaffected", () => {
  it("/health and /ready answer 200 with the full set of proxy headers", async () => {
    const health = await withProxyHeaders(request(app).get("/health"));
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");
    const ready = await withProxyHeaders(request(app).get("/ready"));
    expect(ready.status).toBe(200);
  });

  it("an ordinary API read works through the proxy (200, real data path)", async () => {
    const res = await withProxyHeaders(request(app).get("/api/v1/products"));
    expect(res.status).toBe(200);
  });

  it("an API write reaches its handler and its own validation (4xx from the route, not the guard's empty 404)", async () => {
    const res = await withProxyHeaders(request(app).post("/api/v1/auth/login").send({}));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(404);
    expect(res.body.error?.code).toBeTruthy(); // a structured application error
  });

  it("an unknown route via the proxy gets the application's structured 404, distinguishable from the /metrics guard's empty 404", async () => {
    const res = await withProxyHeaders(request(app).get("/api/v1/definitely-not-a-route"));
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBeTruthy();
  });

  it("each header on its own is harmless to normal routes", async () => {
    for (const [name, value] of Object.entries(PROXY_HEADERS)) {
      const res = await request(app).get("/api/v1/products").set(name, value);
      expect(res.status, name).toBe(200);
    }
  });
});

describe("/metrics: the ONLY route the rule applies to", () => {
  it("is served to a direct scrape (no proxy headers) — what Prometheus does", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("# TYPE woobe_http_requests_total counter");
  });

  it("is refused (empty 404) when ANY single proxy header is present, including spoofed ones from a direct client", async () => {
    for (const [name, value] of Object.entries(PROXY_HEADERS)) {
      const res = await request(app).get("/metrics").set(name, value);
      expect(res.status, name).toBe(404);
      expect(res.text, name).toBe("");
    }
  });

  it("every case/slash variant of /metrics behaves the same way", async () => {
    for (const path of ["/metrics/", "/METRICS", "/Metrics/"]) {
      expect((await request(app).get(path)).status, path).toBe(200);
      expect((await withProxyHeaders(request(app).get(path))).status, `${path} via proxy`).toBe(404);
    }
  });

  it("a spoofed header on a direct request cannot UNLOCK anything: it only ever makes /metrics stricter", async () => {
    // e.g. pretending to be the loopback scraper does not help — the presence of the header is what is refused
    const res = await request(app).get("/metrics").set("X-Forwarded-For", "127.0.0.1").set("X-Real-IP", "127.0.0.1");
    expect(res.status).toBe(404);
  });
});

describe("the client IP the rate limiter sees (req.ip) behind the proxy", () => {
  const prefix = `fwdtest-${randomUUID().slice(0, 8)}`;

  /** A tiny app wired exactly like production's IP handling: production's `trust proxy` value + the REAL rateLimit middleware. */
  function limitedApp(trustHops: number) {
    const a = express();
    a.set("trust proxy", trustHops);
    a.get("/ip", (req, res) => void res.json({ ip: req.ip }));
    a.get("/limited", rateLimit({ keyPrefix: `${prefix}-h${trustHops}`, max: 2, windowSeconds: 30 }), (_req, res) => void res.json({ ok: true }));
    a.use(errorHandler);
    return a;
  }

  afterAll(async () => {
    const keys = await redis.keys(`ratelimit:${prefix}-*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  it("production default is exactly ONE trusted hop (nginx) and dev/test trust none", () => {
    expect(resolveTrustProxyHops("production", undefined)).toBe(1);
    expect(resolveTrustProxyHops("development", undefined)).toBe(0);
    expect(resolveTrustProxyHops("test", undefined)).toBe(0);
  });

  it("with 1 trusted hop, req.ip is the client address nginx put in X-Forwarded-For", async () => {
    const res = await request(limitedApp(1)).get("/ip").set("X-Forwarded-For", "203.0.113.9");
    expect(res.body.ip).toBe("203.0.113.9");
  });

  it("with 1 trusted hop, a client-forged prefix cannot choose the identity: only the address nginx appended (rightmost) counts", async () => {
    const res = await request(limitedApp(1)).get("/ip").set("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
    expect(res.body.ip).toBe("203.0.113.9");
  });

  it("with 1 trusted hop, rate limits are PER REAL CLIENT: one client hitting the limit does not lock out another", async () => {
    const a = limitedApp(1);
    const from = (ip: string) => request(a).get("/limited").set("X-Forwarded-For", ip);
    expect((await from("198.51.100.1")).status).toBe(200);
    expect((await from("198.51.100.1")).status).toBe(200);
    expect((await from("198.51.100.1")).status).toBe(429); // client 1 is limited...
    expect((await from("198.51.100.2")).status).toBe(200); // ...client 2 is not
  });

  it("with 0 trusted hops (a directly connected client, no proxy) X-Forwarded-For is IGNORED, so rotating it cannot evade the limit", async () => {
    const a = limitedApp(0);
    const from = (ip: string) => request(a).get("/limited").set("X-Forwarded-For", ip);
    expect((await from("192.0.2.1")).status).toBe(200);
    expect((await from("192.0.2.2")).status).toBe(200);
    expect((await from("192.0.2.3")).status).toBe(429); // same real peer -> same bucket, whatever the header says
    expect((await request(a).get("/ip").set("X-Forwarded-For", "192.0.2.77")).body.ip).not.toBe("192.0.2.77");
  });
});
