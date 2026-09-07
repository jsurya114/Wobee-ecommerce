import { bumpCatalogCacheVersion, cacheAside } from "../../../../shared/cache/catalog-cache";
import type { BannerRepositoryPort, CreateBannerInput, UpdateBannerInput } from "../../application/ports/banner-repository.port";
import type { BannerEntity, BannerSummaryEntity } from "../../domain/entities/banner.entity";

const VISIBLE_TTL_SECONDS = 60;

/**
 * Read-through cache decorator (ADR-017) around the real `BannerRepository`
 * — same shape as `CachedProductRepository`. `findVisible(now)` takes a
 * live timestamp, so the cache key deliberately excludes it (a constant
 * key, not one per millisecond, which would never hit) — the 60s TTL is
 * what bounds how late/early a scheduled banner's `startAt`/`endAt`
 * boundary can appear to fire, the same "short TTL as backstop" trade-off
 * ADR-017 already accepts elsewhere. Any admin write still busts it
 * immediately via the shared catalog cache version.
 */
export class CachedBannerRepository implements BannerRepositoryPort {
  constructor(private readonly inner: BannerRepositoryPort) {}

  findVisible(now: Date): Promise<BannerSummaryEntity[]> {
    return cacheAside("banners:visible", VISIBLE_TTL_SECONDS, () => this.inner.findVisible(now));
  }

  findAllForAdmin(): Promise<BannerEntity[]> {
    return this.inner.findAllForAdmin();
  }

  findByIdForAdmin(id: string): Promise<BannerEntity | null> {
    return this.inner.findByIdForAdmin(id);
  }

  async create(input: CreateBannerInput): Promise<BannerEntity> {
    const result = await this.inner.create(input);
    await bumpCatalogCacheVersion();
    return result;
  }

  async update(id: string, input: UpdateBannerInput): Promise<BannerEntity> {
    const result = await this.inner.update(id, input);
    await bumpCatalogCacheVersion();
    return result;
  }

  async setActive(id: string, isActive: boolean): Promise<BannerEntity> {
    const result = await this.inner.setActive(id, isActive);
    await bumpCatalogCacheVersion();
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.inner.delete(id);
    await bumpCatalogCacheVersion();
  }

  async reorder(orderedIds: string[]): Promise<void> {
    await this.inner.reorder(orderedIds);
    await bumpCatalogCacheVersion();
  }
}
