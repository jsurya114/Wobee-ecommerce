import type { CollectionRepositoryPort } from "../ports/collection-repository.port";

/**
 * Exported from collections.module.ts for cross-module use — products'
 * listing filter resolves a `?collection=<slug>` query param through this
 * instead of importing @woobe/database's Collection model itself (ADR-010:
 * Collection belongs to this module, not products). Mirrors
 * categories/application/use-cases/find-category-by-slug.use-case.ts exactly.
 */
export class FindCollectionBySlugUseCase {
  constructor(private readonly collectionRepository: CollectionRepositoryPort) {}

  execute(slug: string): Promise<string | null> {
    return this.collectionRepository.findIdBySlug(slug);
  }
}
