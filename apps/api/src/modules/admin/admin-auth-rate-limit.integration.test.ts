import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { redis } from "../../config/redis";

/**
 * Staff Management System (2026-09-06) fix — admin-auth.routes.ts had no
 * rate limiting at all, unlike the customer /auth/login it shares
 * LoginUserUseCase with (see admin-auth.routes.ts's own comment). Kept in
 * its own file rather than alongside admin-staff.integration.test.ts: this
 * test necessarily exhausts the shared `admin-auth:login` Redis bucket
 * (IP-keyed, not per-email — rate-limit.ts), which every `loginAdmin()` call
 * in that much larger suite also depends on; `fileParallelism: false`
 * (vitest.config.ts) is what keeps this file from ever running concurrently
 * with that one.
 */
describe("admin auth: login rate limiting", () => {
  afterAll(async () => {
    // Reset the shared bucket so a later test FILE (fileParallelism: false
    // means files run one at a time, never concurrently with this one)
    // doesn't inherit an already-exhausted counter. Deliberately doesn't
    // close the shared `redis` connection — other integration test files
    // reuse the same singleton.
    const keys = await redis.keys("ratelimit:admin-auth:login:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  it("429s once the bucket for this IP is at its cap", async () => {
    const app = createApp();
    const email = `admin-auth-rate-limit-${randomUUID()}@test.woobe.internal`;

    // One real request first, purely to learn the exact IP-keyed Redis key
    // this middleware uses (rate-limit.ts: `ratelimit:${keyPrefix}:${req.ip}`)
    // — cheaper and far less flaky than actually firing 400 real HTTP
    // requests to reach the (deliberately high, test-volume-sized) cap.
    await request(app).post("/api/v1/admin/auth/login").send({ email, password: "wrong-password" });
    const [key] = await redis.keys("ratelimit:admin-auth:login:*");
    expect(key).toBeDefined();

    // Fast-forward the bucket to its cap (400 — see admin-auth.routes.ts's
    // own comment on why this budget is much higher than customer login's).
    await redis.set(key!, 400);

    const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(429);
  });
});
