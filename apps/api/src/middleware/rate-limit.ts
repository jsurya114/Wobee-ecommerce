import type { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { TooManyRequestsError } from "../shared/errors";

export interface RateLimitOptions {
  /** Redis key namespace for this limiter — keeps distinct routes' counters from colliding, same reasoning as RedisClaimAttemptLimiterService's own key prefix. */
  keyPrefix: string;
  /** Requests allowed per window, per client IP. */
  max: number;
  windowSeconds: number;
}

/**
 * IP-keyed fixed-window rate limiter (ADR-017: Redis is the reserved home
 * for rate limiting) — INCR then EXPIRE-once-on-first-hit, the same pattern
 * `RedisClaimAttemptLimiterService` already established for the
 * guest-order-claim endpoint. Closes a previously-documented, real gap
 * (`otp.policy.ts`'s own comment: "no rate limiting anywhere in this API
 * yet") on the credential- and OTP-guessing surface: login, register/*,
 * forgot-password, reset-password/* (security audit, 2026-09-04).
 *
 * IP-only, not per-account — this repo has no per-account lockout state
 * (that would need a schema change, tracked as a follow-up in journal.md);
 * IP-based throttling is the here-and-now defense-in-depth layer. A shared
 * proxy/NAT can cause false sharing between unrelated users behind the same
 * IP — an accepted trade-off, not a new one (the existing claim-limiter has
 * the identical property).
 *
 * Fails OPEN on a Redis error, deliberately: `ClaimAttemptLimiterPort`'s own
 * doc comment already establishes "losing this on a Redis restart is
 * harmless" as this codebase's posture for these guards — a Redis outage
 * should degrade to "no rate limiting" on this one route, not take the
 * entire auth surface down with it.
 */
export function rateLimit({ keyPrefix, max, windowSeconds }: RateLimitOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `ratelimit:${keyPrefix}:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > max) {
        const retryAfterSeconds = await redis.ttl(key);
        next(new TooManyRequestsError(`Too many requests — try again in ${Math.max(retryAfterSeconds, 1)}s`));
        return;
      }
      next();
    } catch (err) {
      console.error(`[rate-limit:${keyPrefix}] redis error, failing open:`, err instanceof Error ? err.message : err);
      next();
    }
  };
}
