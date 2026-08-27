import type { UpdateCollectionInput as UpdateCollectionRequest } from "@woobe/validation";
import type { CollectionEntity } from "../../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/** Metadata edit (name/slug/description) — activation/deactivation is its own use-case (SetCollectionActiveUseCase), a distinct admin action per week2 (1).md §4. */
export class UpdateCollectionUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(id: string, input: UpdateCollectionRequest): Promise<CollectionEntity> {
    return this.collectionRepository.update(id, input);
  }
}
