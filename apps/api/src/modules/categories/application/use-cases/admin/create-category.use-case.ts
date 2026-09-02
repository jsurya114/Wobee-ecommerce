import type { CreateCategoryInput as CreateCategoryRequest } from "@woobe/validation";
import { resolveUniqueSlug } from "../../../domain/resolve-unique-slug";
import type { AdminCategoryEntity } from "../../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

/**
 * Slug is auto-generated from the name (or the admin's typed override) and
 * canonicalized + de-duplicated server-side — same pattern as
 * CreateProductUseCase. The client's live preview is a preview only.
 */
export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  async execute(input: CreateCategoryRequest): Promise<AdminCategoryEntity> {
    const slug = await resolveUniqueSlug(input.slug, (candidate) => this.categoryRepository.slugExists(candidate));
    return this.categoryRepository.createCategory({ name: input.name, slug, imageUrl: input.imageUrl });
  }
}
