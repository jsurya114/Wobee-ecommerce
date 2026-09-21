/**
 * Tiny in-process TTL cache with single-flight: concurrent misses for one key
 * share ONE in-flight computation, so an admin hammering refresh (or several
 * admins opening the dashboard at once) runs the ~25 aggregate queries once per
 * TTL instead of once per request. Per-process is deliberate — Woobe runs one
 * API instance, and a stale-by-<=45s dashboard needs no shared cache.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 64,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = compute()
      .then((value) => {
        if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}
