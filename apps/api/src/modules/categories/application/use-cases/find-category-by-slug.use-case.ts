import type { CategoryRepositoryPort } from "../ports/category-repository.port";

/**
 * Exported from categories.module.ts for cross-module use — products'
 * listing filter resolves a `?category=<slug>` query param through this
 * instead of importing @woobe/database's Category model itself (ADR-010:
 * Category belongs to this module, not products).
 */
export class FindCategoryBySlugUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  execute(slug: string): Promise<string | null> {
    return this.categoryRepository.findIdBySlug(slug);
  }
}
