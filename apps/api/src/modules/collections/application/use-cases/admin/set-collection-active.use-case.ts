import type { CollectionEntity } from "../../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/** Activate/deactivate — a deactivated collection stops appearing in the customer-facing listing/detail endpoints (findActiveCollections/findActiveBySlug) immediately, without deleting its product assignments. */
export class SetCollectionActiveUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(id: string, isActive: boolean): Promise<CollectionEntity> {
    return this.collectionRepository.setActive(id, isActive);
  }
}
