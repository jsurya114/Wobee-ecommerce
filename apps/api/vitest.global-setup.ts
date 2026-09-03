import Redis from "ioredis";

/**
 * Runs once before the whole suite (vitest's `globalSetup`, not a per-file
 * hook). The test Redis DB (`REDIS_URL`, same instance across every local
 * `pnpm test` invocation — see vitest.config.ts's own comment on why
 * fileParallelism is off) persists whatever `middleware/rate-limit.ts`'s
 * fixed-window counters wrote on the LAST run for up to their 10-minute TTL.
 * Two `pnpm test` runs back-to-back would otherwise stack one run's count on
 * top of the next and spuriously 429 legitimate test traffic — a real
 * finding hit while adding rate limiting (2026-09-04). Scoped to the
 * `ratelimit:*` prefix only, so it never touches any other Redis-backed
 * test state (coupon preview cache, the guest-order-claim limiter, the
 * notification queue).
 */
export default async function setup(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380/1";
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys("ratelimit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}
