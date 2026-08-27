import { NotFoundError } from "../../../../../shared/errors";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

export class RemoveCollectionProductUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  async execute(collectionId: string, productId: string): Promise<void> {
    const collection = await this.collectionRepository.findByIdForAdmin(collectionId);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    await this.collectionRepository.removeProduct(collectionId, productId);
  }
}
