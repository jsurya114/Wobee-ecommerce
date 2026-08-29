import { NotFoundError } from "../../../../../shared/errors";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/**
 * Assign a product to a collection (week2 (1).md §4). Doesn't reach across
 * to `products` for an existence pre-check — the repository's insert relies
 * on ProductCollection.productId's FK constraint and maps its violation
 * (P2003) to the same NotFoundError, same TOCTOU-safe pattern
 * AuthRepository.createUserWithPassword uses for its own unique-constraint
 * check (auth/infrastructure/repositories/auth.repository.ts).
 */
export class AssignCollectionProductUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  async execute(collectionId: string, productId: string): Promise<void> {
    const collection = await this.collectionRepository.findByIdForAdmin(collectionId);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    await this.collectionRepository.assignProduct(collectionId, productId);
  }
}
