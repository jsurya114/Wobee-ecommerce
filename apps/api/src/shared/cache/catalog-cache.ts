import { redis } from "../../config/redis";

const CATALOG_VERSION_KEY = "cache:catalog:version";

/**
 * ADR-017 (Caching Strategy, project_planning/plan.md): Redis read-through
 * cache for PUBLIC, non-transactional catalog data only — product/category/
 * banner/home listings the way ADR-017 already names ("the admin ₹/kg
 * default rate + per-product rate overrides for DISPLAY purposes... short
 * TTL as a backstop, explicit bust on write is the primary mechanism").
 * Never wraps a price/stock figure a checkout or PDP purchase decision
 * reads (DEVELOPMENT_RULES.md #1) — callers only ever pass this the parts
 * of a use-case's own repository read that are pure admin-edited catalog
 * data; live pricing/inventory calls stay outside it, on every request.
 *
 * Reuses the ONE `redis` client every other Redis-backed feature in this
 * API already shares (`middleware/rate-limit.ts`,
 * `RedisClaimAttemptLimiterService`) — no second connection.
 *
 * This module itself is always "live" — no env-based self-disabling here
 * (see `catalog-cache.test.ts`, which exercises real hit/miss/error-
 * fallback/version-bump behavior against the real test Redis). The decision
 * to skip caching under `pnpm test` is made one layer up, by each
 * `*.module.ts` composition root choosing NOT to construct a `Cached*`
 * repository/wrapper when `env.NODE_ENV === "test"` — see any of those
 * files' own doc comment for why: every `*.integration.test.ts` in this
 * repo seeds fixtures via raw Prisma writes that bypass a decorated
 * repository's invalidation, then asserts on an immediate GET of the same
 * resource (`home.integration.test.ts` is the clearest example), which a
 * live cache in that path would break deterministically.
 */

/**
 * One shared counter for the whole catalog cache namespace, bumped by
 * `bumpCatalogCacheVersion()` on any product/category/banner/collection
 * admin write. Every cache key embeds the current version at read time, so
 * a bump makes every previously-cached key unreachable — it's simply never
 * read again, and expires on its own via its existing TTL — without a
 * Redis-wide FLUSHALL or a SCAN/DEL pass over the combinatorial filter/
 * sort/page key shapes a product listing can be cached under. Deliberately
 * coarse: editing one product also expires OTHER, unrelated products'
 * still-valid cached detail pages. Simple and provably correct (nothing can
 * ever be served stale past a write) beats maximally surgical per-entity
 * invalidation here — a deliberate trade-off, not an oversight.
 */
export async function getCatalogCacheVersion(): Promise<number> {
  try {
    const value = await redis.get(CATALOG_VERSION_KEY);
    return value ? Number(value) || 0 : 0;
  } catch (err) {
    console.error("[catalog-cache] version read failed, treating as v0:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Called after a catalog-affecting admin write commits to Postgres — never before, and never allowed to fail that write (see the try/catch below). */
export async function bumpCatalogCacheVersion(): Promise<void> {
  try {
    await redis.incr(CATALOG_VERSION_KEY);
  } catch (err) {
    // Worst case: reads keep serving the previous version's cache for up to
    // its own TTL — the admin write that triggered this has already
    // committed to Postgres by the time this runs, so this never undoes it.
    console.error("[catalog-cache] version bump failed:", err instanceof Error ? err.message : err);
  }
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    console.error(`[catalog-cache] read failed for "${key}", falling back live:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function safeParse<T>(raw: string, key: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[catalog-cache] malformed cache value for "${key}", ignoring:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

async function safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`[catalog-cache] write failed for "${key}":`, err instanceof Error ? err.message : err);
  }
}

/**
 * Read-through cache-aside. HIT returns the parsed cached value without
 * calling `load`. MISS (including "Redis is unreachable" and "the cached
 * value was malformed") calls `load`, best-effort caches its result, and
 * returns it — a Redis outage degrades this to "always live," never a
 * broken or empty response (same fail-open posture `rate-limit.ts`
 * already established for this codebase's other Redis-backed guard).
 *
 * `key` is a caller-built, deterministic string encoding every parameter
 * that affects the result (filters/sort/page/id/etc.) — see each call
 * site's own key-building comment. The current catalog version is
 * prefixed on automatically; callers never manage versioning themselves.
 */
export async function cacheAside<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const version = await getCatalogCacheVersion();
  const fullKey = `cache:v${version}:${key}`;

  const cached = await safeGet(fullKey);
  if (cached !== null) {
    const parsed = safeParse<T>(cached, fullKey);
    if (parsed !== undefined) return parsed;
  }

  const result = await load();
  await safeSet(fullKey, result, ttlSeconds);
  return result;
}
