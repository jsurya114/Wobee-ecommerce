import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "../../config/redis";
import { bumpCatalogCacheVersion, cacheAside, getCatalogCacheVersion } from "./catalog-cache";

/**
 * Exercises the cache helper directly against the real test Redis (this
 * repo's own "no mocking" integration-test convention — see REDIS_URL in
 * vitest.config.ts, an isolated logical DB from dev/prod). Deliberately
 * NOT routed through any `*.integration.test.ts` HTTP path: every module
 * that actually wires this cache in skips it entirely under `pnpm test`
 * (see products.module.ts's own comment on why), so this is the one place
 * that proves hit/miss/error-fallback/version-bump behavior for real.
 */
describe("catalog-cache", () => {
  beforeEach(async () => {
    const keys = await redis.keys("cache:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("MISS calls load and caches the result", async () => {
    const load = vi.fn().mockResolvedValue({ value: "fresh" });

    const result = await cacheAside("test:a", 60, load);

    expect(result).toEqual({ value: "fresh" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("HIT returns the cached value without calling load again", async () => {
    const load = vi.fn().mockResolvedValue({ value: "fresh" });

    const first = await cacheAside("test:b", 60, load);
    const second = await cacheAside("test:b", 60, load);

    expect(second).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a different key is a separate cache entry", async () => {
    const loadX = vi.fn().mockResolvedValue({ value: "x" });
    const loadY = vi.fn().mockResolvedValue({ value: "y" });

    const x = await cacheAside("test:c:x", 60, loadX);
    const y = await cacheAside("test:c:y", 60, loadY);

    expect(x).toEqual({ value: "x" });
    expect(y).toEqual({ value: "y" });
    expect(loadX).toHaveBeenCalledTimes(1);
    expect(loadY).toHaveBeenCalledTimes(1);
  });

  it("bumpCatalogCacheVersion invalidates every previously-cached key at once", async () => {
    const load = vi.fn().mockResolvedValue({ value: "v1" });

    await cacheAside("test:d", 60, load);
    expect(load).toHaveBeenCalledTimes(1);

    // Still a HIT before the bump.
    await cacheAside("test:d", 60, load);
    expect(load).toHaveBeenCalledTimes(1);

    await bumpCatalogCacheVersion();

    // Same key, but the version prefix changed underneath it — a fresh MISS.
    const load2 = vi.fn().mockResolvedValue({ value: "v2" });
    const result = await cacheAside("test:d", 60, load2);
    expect(result).toEqual({ value: "v2" });
    expect(load2).toHaveBeenCalledTimes(1);
  });

  it("getCatalogCacheVersion increases by exactly one per bump", async () => {
    const before = await getCatalogCacheVersion();
    await bumpCatalogCacheVersion();
    const after = await getCatalogCacheVersion();
    expect(after).toBe(before + 1);
  });

  it("a malformed cached value is treated as a miss, not an error", async () => {
    const version = await getCatalogCacheVersion();
    await redis.set(`cache:v${version}:test:e`, "{not valid json", "EX", 60);

    const load = vi.fn().mockResolvedValue({ value: "recovered" });
    const result = await cacheAside("test:e", 60, load);

    expect(result).toEqual({ value: "recovered" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("Redis GET failing still returns a live result instead of throwing", async () => {
    vi.spyOn(redis, "get").mockRejectedValueOnce(new Error("simulated Redis outage"));
    const load = vi.fn().mockResolvedValue({ value: "live" });

    const result = await cacheAside("test:f", 60, load);

    expect(result).toEqual({ value: "live" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("Redis SET failing still returns load's fresh result instead of throwing", async () => {
    vi.spyOn(redis, "set").mockRejectedValueOnce(new Error("simulated Redis outage"));
    const load = vi.fn().mockResolvedValue({ value: "live" });

    const result = await cacheAside("test:g", 60, load);

    expect(result).toEqual({ value: "live" });
  });

  it("Redis being unreachable for the version lookup still falls back to a live load (fails open, never throws)", async () => {
    vi.spyOn(redis, "get").mockRejectedValue(new Error("simulated Redis outage"));
    const load = vi.fn().mockResolvedValue({ value: "live" });

    await expect(cacheAside("test:h", 60, load)).resolves.toEqual({ value: "live" });
  });
});
