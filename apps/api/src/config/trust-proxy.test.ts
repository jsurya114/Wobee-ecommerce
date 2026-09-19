import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { resolveTrustProxyHops } from "./trust-proxy";

describe("resolveTrustProxyHops", () => {
  it("trusts exactly one hop (nginx) in production when unset", () => {
    expect(resolveTrustProxyHops("production", undefined)).toBe(1);
  });

  it("trusts nothing in development and test when unset", () => {
    expect(resolveTrustProxyHops("development", undefined)).toBe(0);
    expect(resolveTrustProxyHops("test", undefined)).toBe(0);
  });

  it("an explicit value always wins, including 0 in production", () => {
    expect(resolveTrustProxyHops("production", 0)).toBe(0);
    expect(resolveTrustProxyHops("production", 2)).toBe(2);
    expect(resolveTrustProxyHops("development", 1)).toBe(1);
  });
});

/** The Express semantics the nginx design relies on, exercised with the real setting. */
describe("req.ip behind the trusted proxy", () => {
  function ipApp(hops: number) {
    const app = express();
    app.set("trust proxy", hops);
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    return app;
  }

  it("with 1 hop, uses the address nginx put in X-Forwarded-For", async () => {
    const res = await request(ipApp(1)).get("/ip").set("X-Forwarded-For", "203.0.113.9");
    expect(res.body.ip).toBe("203.0.113.9");
  });

  it("with 1 hop, a client-forged left-hand entry cannot become the IP", async () => {
    // nginx overwrites the header, but even if a forged chain reached the API only the
    // entry added by the trusted proxy (the rightmost) is believed.
    const res = await request(ipApp(1)).get("/ip").set("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
    expect(res.body.ip).toBe("203.0.113.9");
  });

  it("with 0 hops (dev/test), X-Forwarded-For is ignored entirely", async () => {
    const res = await request(ipApp(0)).get("/ip").set("X-Forwarded-For", "6.6.6.6");
    expect(res.body.ip).not.toBe("6.6.6.6");
  });
});
