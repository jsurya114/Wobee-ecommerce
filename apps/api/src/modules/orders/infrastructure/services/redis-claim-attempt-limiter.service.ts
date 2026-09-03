import { redis } from "../../../../config/redis";
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
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, WINDOW_SECONDS);
    }
    return count <= MAX_ATTEMPTS_PER_WINDOW;
  }
}
