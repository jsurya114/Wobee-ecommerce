import { NotFoundError } from "../../../../../shared/errors";
import type { CollectionEntity } from "../../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

export interface CollectionAdminDetail extends CollectionEntity {
  /** Ordered by admin-controlled sortOrder — see ProductCollection.sortOrder's own schema comment. */
  productIds: string[];
}

/** Admin detail — collection metadata + its assigned product ids, for the edit/manage view. */
export class GetCollectionAdminUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  async execute(id: string): Promise<CollectionAdminDetail> {
    const collection = await this.collectionRepository.findByIdForAdmin(id);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    const productIds = await this.collectionRepository.listProductIds(id);
    return { ...collection, productIds };
  }
}
