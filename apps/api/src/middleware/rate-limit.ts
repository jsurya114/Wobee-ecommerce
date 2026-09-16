import type { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { TooManyRequestsError } from "../shared/errors";
import { logError } from "../shared/logger";

export interface RateLimitOptions {
  /** Redis key namespace for this limiter — keeps distinct routes' counters from colliding, same reasoning as RedisClaimAttemptLimiterService's own key prefix. */
  keyPrefix: string;
  /** Requests allowed per window, per identity (see `keyExtractor`). */
  max: number;
  windowSeconds: number;
  /**
   * What identifies "one client" for this limiter. Defaults to the request
   * IP (the original, IP-only behavior). Pass `byBodyField("email")` (below)
   * to key by a target identifier instead — e.g. an OTP/password-reset route
   * where the real abuse case is "spam one victim's inbox by rotating source
   * IPs," which a per-IP limiter alone cannot catch (forensic review,
   * 2026-09-13). Returning `null` (field absent/not a string) skips this
   * limiter for that request rather than sharing one bucket across every
   * malformed submission.
   */
  keyExtractor?: (req: Request) => string | null;
}

/** Keys by a string field in the (not-yet-validated) request body, lowercased/trimmed so `Foo@Bar.com` and `foo@bar.com ` share one bucket. */
export function byBodyField(field: string): (req: Request) => string | null {
  return (req: Request) => {
    const raw = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
  };
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
export function rateLimit({ keyPrefix, max, windowSeconds, keyExtractor }: RateLimitOptions) {
  const extractIdentity = keyExtractor ?? ((req: Request) => req.ip ?? null);
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identity = extractIdentity(req);
    if (identity === null) {
      next();
      return;
    }
    try {
      const key = `ratelimit:${keyPrefix}:${identity}`;
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
      logError("rate_limit_redis_error", { keyPrefix, failedOpen: true, message: err instanceof Error ? err.message : String(err) });
      next();
    }
  };
}
