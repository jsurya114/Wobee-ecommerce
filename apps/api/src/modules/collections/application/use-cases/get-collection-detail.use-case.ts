import { NotFoundError } from "../../../../shared/errors";
import type { CollectionEntity } from "../../domain/entities/collection.entity";
import type { CollectionRepositoryPort } from "../ports/collection-repository.port";

/**
 * Customer-facing collection detail (Week 2 Day 2, week2 (1).md §4). Returns
 * metadata only — the product rail is sourced by the caller (apps/web's
 * collection page) hitting GET /api/v1/products?collection=<slug> directly,
 * which already supports this filter (Week 2 Day 1) with its own pagination/
 * sort/availability handling. Duplicating that query here would diverge from
 * the one already-tested path for no benefit.
 */
export class GetCollectionDetailUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  async execute(slug: string): Promise<CollectionEntity> {
    const collection = await this.collectionRepository.findActiveBySlug(slug);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    return collection;
  }
}
