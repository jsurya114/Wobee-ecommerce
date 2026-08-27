import type { CollectionEntity } from "../../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/** Admin listing — includes inactive collections (unlike the customer-facing ListCollectionsUseCase). RBAC-gated at the route (MANAGE_CATALOG). */
export class ListCollectionsAdminUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(): Promise<CollectionEntity[]> {
    return this.collectionRepository.findAllForAdmin();
  }
}
