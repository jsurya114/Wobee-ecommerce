import type { CategoryEntity } from "../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../ports/category-repository.port";

export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  execute(): Promise<CategoryEntity[]> {
    return this.categoryRepository.findActiveCategories();
  }
}
