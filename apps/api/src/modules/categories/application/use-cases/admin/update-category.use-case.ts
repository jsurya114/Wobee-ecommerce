import type { UpdateCategoryInput as UpdateCategoryRequest } from "@woobe/validation";
import { resolveUniqueSlug } from "../../../domain/resolve-unique-slug";
import type { AdminCategoryEntity } from "../../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

/**
 * Slug is left untouched unless the admin explicitly supplies one — editing
 * the category NAME must never silently change its slug (breaks any
 * existing storefront link/bookmark), same rule as UpdateProductUseCase.
 */
export class UpdateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  async execute(id: string, input: UpdateCategoryRequest): Promise<AdminCategoryEntity> {
    if (input.slug === undefined) {
      return this.categoryRepository.updateCategory(id, input);
    }
    const slug = await resolveUniqueSlug(input.slug, (candidate) => this.categoryRepository.slugExists(candidate, id));
    return this.categoryRepository.updateCategory(id, { ...input, slug });
  }
}
