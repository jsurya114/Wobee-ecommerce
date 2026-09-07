import { bumpCatalogCacheVersion, cacheAside } from "../../../../shared/cache/catalog-cache";
import type { CreateCategoryData, CategoryRepositoryPort, UpdateCategoryData } from "../../application/ports/category-repository.port";
import type { AdminCategoryEntity, CategoryEntity } from "../../domain/entities/category.entity";

const LIST_TTL_SECONDS = 300;

/**
 * Read-through cache decorator (ADR-017) around the real
 * `CategoryRepository` — same shape as `CachedProductRepository`. Only
 * `findActiveCategories()` is cached (Home's category rail + the storefront
 * category dropdown, both feed off it, per the shared catalog version so
 * both invalidate together with product/banner/collection writes); a
 * longer TTL than product listings is fine here — categories are added/
 * renamed far less often, and any write still busts it immediately via
 * `bumpCatalogCacheVersion`. `findIdBySlug` (a single-row indexed lookup
 * used internally by `ListProductsUseCase`'s own category filter) stays a
 * direct passthrough — trivial to answer live already, not worth another
 * cache entry.
 */
export class CachedCategoryRepository implements CategoryRepositoryPort {
  constructor(private readonly inner: CategoryRepositoryPort) {}

  findActiveCategories(): Promise<CategoryEntity[]> {
    return cacheAside("categories:list", LIST_TTL_SECONDS, () => this.inner.findActiveCategories());
  }

  findIdBySlug(slug: string): Promise<string | null> {
    return this.inner.findIdBySlug(slug);
  }

  findAllForAdmin(): Promise<AdminCategoryEntity[]> {
    return this.inner.findAllForAdmin();
  }

  findByIdForAdmin(id: string): Promise<AdminCategoryEntity | null> {
    return this.inner.findByIdForAdmin(id);
  }

  slugExists(slug: string, excludeId?: string): Promise<boolean> {
    return this.inner.slugExists(slug, excludeId);
  }

  async createCategory(data: CreateCategoryData): Promise<AdminCategoryEntity> {
    const result = await this.inner.createCategory(data);
    await bumpCatalogCacheVersion();
    return result;
  }

  async updateCategory(id: string, data: UpdateCategoryData): Promise<AdminCategoryEntity> {
    const result = await this.inner.updateCategory(id, data);
    await bumpCatalogCacheVersion();
    return result;
  }

  async setActive(id: string, isActive: boolean): Promise<AdminCategoryEntity> {
    const result = await this.inner.setActive(id, isActive);
    await bumpCatalogCacheVersion();
    return result;
  }

  async reorder(categoryIds: string[]): Promise<void> {
    await this.inner.reorder(categoryIds);
    await bumpCatalogCacheVersion();
  }
}
