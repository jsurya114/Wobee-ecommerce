import Redis from "ioredis";
import { env } from "./env";

/**
 * Redis is reserved for hot-path use only (ADR-017): session tokens,
 * rate limiting, inventory reservation locks/TTLs, and short-TTL display
 * caches. Never the source of truth for price/stock/payment decisions.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
