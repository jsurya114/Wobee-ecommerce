import type { CollectionEntity } from "../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../ports/collection-repository.port";

/**
 * Day 1 scope: listing only (GET /api/v1/collections) — collection detail
 * pages, product rails, and admin CRUD are Module 2 / Day 2 (week2 (1).md
 * §4), built on top of this same repository later.
 */
export class ListCollectionsUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(): Promise<CollectionEntity[]> {
    return this.collectionRepository.findActiveCollections();
  }
}
