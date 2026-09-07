import { bumpCatalogCacheVersion } from "../../../../shared/cache/catalog-cache";
import type { CollectionRepositoryPort, CreateCollectionInput, UpdateCollectionInput } from "../../application/ports/collection-repository.port";
import type { CollectionEntity } from "../../domain/entities/collection.entity";

/**
 * NOT a read-through cache — collections have no dedicated cache entry of
 * their own (their own listing isn't one of the priority surfaces this
 * caching pass targets). This decorator exists purely so a collection
 * admin write busts the SHARED catalog cache version, since Home's
 * `GetHomePageUseCase` (cached as one aggregate) and `ListProductsUseCase`'s
 * `?collection=` filter (cached per the products decorator) both embed
 * collection data — without this, a collection rename/deactivation could
 * lag behind by up to those callers' own TTL instead of invalidating
 * immediately, same correctness gap the product/category/banner decorators
 * close for their own resources.
 */
export class CacheInvalidatingCollectionRepository implements CollectionRepositoryPort {
  constructor(private readonly inner: CollectionRepositoryPort) {}

  findActiveCollections(): Promise<CollectionEntity[]> {
    return this.inner.findActiveCollections();
  }

  findIdBySlug(slug: string): Promise<string | null> {
    return this.inner.findIdBySlug(slug);
  }

  findActiveBySlug(slug: string): Promise<CollectionEntity | null> {
    return this.inner.findActiveBySlug(slug);
  }

  findAllForAdmin(): Promise<CollectionEntity[]> {
    return this.inner.findAllForAdmin();
  }

  findByIdForAdmin(id: string): Promise<CollectionEntity | null> {
    return this.inner.findByIdForAdmin(id);
  }

  async create(input: CreateCollectionInput): Promise<CollectionEntity> {
    const result = await this.inner.create(input);
    await bumpCatalogCacheVersion();
    return result;
  }

  async update(id: string, input: UpdateCollectionInput): Promise<CollectionEntity> {
    const result = await this.inner.update(id, input);
    await bumpCatalogCacheVersion();
    return result;
  }

  async setActive(id: string, isActive: boolean): Promise<CollectionEntity> {
    const result = await this.inner.setActive(id, isActive);
    await bumpCatalogCacheVersion();
    return result;
  }

  listProductIds(collectionId: string): Promise<string[]> {
    return this.inner.listProductIds(collectionId);
  }

  async assignProduct(collectionId: string, productId: string): Promise<void> {
    await this.inner.assignProduct(collectionId, productId);
    await bumpCatalogCacheVersion();
  }

  async removeProduct(collectionId: string, productId: string): Promise<void> {
    await this.inner.removeProduct(collectionId, productId);
    await bumpCatalogCacheVersion();
  }

  async reorderProducts(collectionId: string, orderedProductIds: string[]): Promise<void> {
    await this.inner.reorderProducts(collectionId, orderedProductIds);
    await bumpCatalogCacheVersion();
  }
}
