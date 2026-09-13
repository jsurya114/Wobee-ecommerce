import { redis } from "../../../../config/redis";
import { logError } from "../../../../shared/logger";
import type { ClaimAttemptLimiterPort } from "../../application/ports/claim-attempt-limiter.port";

/** 10 tries/hour per account — generous for a genuine "let me find my order" attempt, tight enough to blunt brute-forcing the order-number suffix. */
const MAX_ATTEMPTS_PER_WINDOW = 10;
const WINDOW_SECONDS = 60 * 60;

/**
 * Fixed-window counter (ADR-017: Redis is the reserved home for rate
 * limiting) — INCR then EXPIRE-once-on-first-hit is the standard pattern;
 * see ClaimAttemptLimiterPort's own doc comment for why losing this on a
 * Redis restart is an acceptable, not a security, risk.
 */
export class RedisClaimAttemptLimiterService implements ClaimAttemptLimiterPort {
  async allow(key: string): Promise<boolean> {
    const redisKey = `guest-order-claim:${key}`;
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, WINDOW_SECONDS);
      }
      return count <= MAX_ATTEMPTS_PER_WINDOW;
    } catch (err) {
      // Fail OPEN, matching every other Redis-backed guard in this codebase
      // (rate-limit.ts, catalog-cache.ts). This limiter is defense-in-depth
      // on top of the order number's own 48-bit crypto-random suffix (see
      // ClaimAttemptLimiterPort's own doc comment) — that entropy, not this
      // counter, is what actually makes the claim endpoint hard to brute
      // force, so a Redis outage does not meaningfully lower security here.
      // A real customer legitimately claiming their own order should not get
      // a hard 500 because of a Redis hiccup on a non-money-moving action.
      logError("guest_order_claim_limiter_redis_error", { failedOpen: true, message: (err as Error).message });
      return true;
    }
  }
}
