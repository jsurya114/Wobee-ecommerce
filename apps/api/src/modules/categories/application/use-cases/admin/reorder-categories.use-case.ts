import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

export class ReorderCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  execute(categoryIds: string[]): Promise<void> {
    return this.categoryRepository.reorder(categoryIds);
  }
}
