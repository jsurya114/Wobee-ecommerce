import type { AdminCategoryEntity } from "../../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

export class SetCategoryActiveUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  execute(id: string, isActive: boolean): Promise<AdminCategoryEntity> {
    return this.categoryRepository.setActive(id, isActive);
  }
}
