import Redis from "ioredis";
import { env } from "./env";
import { logError } from "../shared/logger";

/**
 * Redis is reserved for hot-path, disposable use only (ADR-017): rate
 * limiting, the guest-order-claim attempt counter, short-TTL catalog display
 * caches, and the BullMQ notification queue. Never the source of truth for
 * price/stock/payment decisions.
 *
 * Correction (forensic review, 2026-09-13): sessions and inventory
 * reservation locking are NOT implemented via Redis, despite ADR-017's
 * original text once suggesting they would be — sessions are JWT access
 * tokens + a Postgres `RefreshToken` table, and inventory reservation is
 * `SELECT ... FOR UPDATE` row locks in Postgres (see
 * inventory.repository.ts). Postgres is the correct tool for both since it
 * is the actual source of truth for stock/auth state; this comment now
 * describes what is actually built, not what was originally planned.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  // Without this, a Redis process that accepts the TCP connection but stalls
  // on replying (GC pause, degraded network) leaves in-flight commands
  // pending indefinitely — that hangs the HTTP request behind them (rate
  // limiting, claim-attempt limiting, catalog cache are all on the request
  // path) instead of hitting the fail-open catch blocks those callers
  // already have for a Redis that is cleanly down. Bounding the wait makes
  // "slow" degrade the same way as "down".
  commandTimeout: 2000,
});

redis.on("error", (err) => {
  logError("redis_connection_error", { message: err.message });
});
