import type { AdminCategoryEntity } from "../../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

export class ListCategoriesAdminUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  execute(): Promise<AdminCategoryEntity[]> {
    return this.categoryRepository.findAllForAdmin();
  }
}
