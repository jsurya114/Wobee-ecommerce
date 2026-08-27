import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/**
 * Reorder (week2 (1).md §4). `orderedProductIds` must be exactly the
 * collection's current product set (same ids, any order) — a partial list
 * would silently leave the omitted products' sortOrder stale/undefined
 * relative to the new ones, and an id from a different collection would
 * write to a row that doesn't exist (the repository's per-id `update`
 * would throw P2025 mid-transaction, leaving no clean partial-success
 * story). Validating the full-set-match here, before touching the
 * database, keeps the failure a clean 400 instead of either of those.
 */
export class ReorderCollectionProductsUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  async execute(collectionId: string, orderedProductIds: string[]): Promise<void> {
    const collection = await this.collectionRepository.findByIdForAdmin(collectionId);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }

    const currentIds = await this.collectionRepository.listProductIds(collectionId);
    const currentSet = new Set(currentIds);
    const orderedSet = new Set(orderedProductIds);
    const sameSize = currentSet.size === orderedSet.size;
    const sameMembers = sameSize && orderedProductIds.every((id) => currentSet.has(id));
    if (!sameMembers || orderedProductIds.length !== currentIds.length) {
      throw new ValidationError("productIds must exactly match the collection's currently-assigned products, in the desired order");
    }

    await this.collectionRepository.reorderProducts(collectionId, orderedProductIds);
  }
}
