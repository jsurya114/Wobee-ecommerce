import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Reorder (week2 (1).md §16). `orderedImageIds` must be exactly the
 * product's current image set (same ids, any order) — same full-set-match
 * validation ReorderCollectionProductsUseCase already established, for the
 * identical reason (a partial or foreign-id list would leave sortOrder
 * stale or fail mid-transaction on an unrelated row).
 */
export class ReorderProductImagesUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(productId: string, orderedImageIds: string[]): Promise<void> {
    const product = await this.productRepository.findByIdForAdmin(productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const currentIds = await this.productRepository.listImageIds(productId);
    const currentSet = new Set(currentIds);
    const orderedSet = new Set(orderedImageIds);
    const sameMembers = currentSet.size === orderedSet.size && orderedImageIds.every((id) => currentSet.has(id));
    if (!sameMembers || orderedImageIds.length !== currentIds.length) {
      throw new ValidationError("imageIds must exactly match the product's currently-attached images, in the desired order");
    }

    await this.productRepository.reorderImages(productId, orderedImageIds);
  }
}
