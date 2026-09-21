import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  it("serves a fresh value from cache and recomputes after the TTL", async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, 8, () => now);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrCompute("k", compute)).toBe(1);
    now = 999;
    expect(await cache.getOrCompute("k", compute)).toBe(1);
    now = 1001;
    expect(await cache.getOrCompute("k", compute)).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("single-flight: concurrent misses share one computation", async () => {
    const cache = new TtlCache<number>(1000);
    let resolve!: (n: number) => void;
    const compute = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const a = cache.getOrCompute("k", compute);
    const b = cache.getOrCompute("k", compute);
    resolve(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const cache = new TtlCache<number>(1000);
    const compute = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(5);
    await expect(cache.getOrCompute("k", compute)).rejects.toThrow("boom");
    expect(await cache.getOrCompute("k", compute)).toBe(5);
  });

  it("evicts the oldest entry beyond maxEntries", async () => {
    const cache = new TtlCache<number>(1000, 2);
    for (const k of ["a", "b", "c"]) await cache.getOrCompute(k, async () => 1);
    const recompute = vi.fn().mockResolvedValue(9);
    await cache.getOrCompute("a", recompute); // evicted -> recomputed
    expect(recompute).toHaveBeenCalledTimes(1);
  });
});
