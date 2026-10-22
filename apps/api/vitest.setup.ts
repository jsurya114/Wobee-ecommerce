import Redis from "ioredis";
import { beforeAll } from "vitest";

/**
 * Runs before EACH test file (vitest `setupFiles`), complementing
 * `vitest.global-setup.ts` (which only clears once, before the whole suite).
 *
 * `middleware/rate-limit.ts` counts per IP in a 5-minute fixed window, and
 * every supertest request in the suite comes from the same IP. Files run
 * sequentially (`fileParallelism: false`) and the suite finishes in ~3
 * minutes, so every `POST /cart/items` from every file lands in ONE window
 * against the cart limiter's 120-request cap. That total crept up as tests
 * were added until it crossed the cap (2026-09-21: observed peak 121), and
 * whichever cart test happened to run next got a spurious 429 — CI failed
 * on an unrelated test each time, and it got worse with every new
 * checkout-driven test.
 *
 * Clearing the cart counters at the start of each file makes each file
 * budget its own 120 requests, so adding tests in one file can no longer
 * starve another. Scoped to `ratelimit:cart:*` only: the auth/admin
 * limiters keep their cross-file behaviour (their own tests key by unique
 * prefix or reset themselves), and no test asserts the cart cap itself.
 * Best-effort — a Redis that is down just means nothing to clear (the
 * limiter fails open in that case anyway).
 */
beforeAll(async () => {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1", { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys("ratelimit:cart:*");
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Redis unavailable (e.g. a unit-only run) — nothing to clear.
  } finally {
    redis.disconnect();
  }
});
