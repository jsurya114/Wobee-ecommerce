import type { CreateCollectionInput as CreateCollectionRequest } from "@woobe/validation";
import type { CollectionEntity } from "../../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../../ports/collection-repository.port";

/** Repository maps the slug-uniqueness DB constraint to ConflictError (409) — see CollectionRepository.create's own comment. */
export class CreateCollectionUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(input: CreateCollectionRequest): Promise<CollectionEntity> {
    return this.collectionRepository.create(input);
  }
}
