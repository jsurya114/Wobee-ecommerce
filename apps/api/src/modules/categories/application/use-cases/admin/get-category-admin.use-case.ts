import { NotFoundError } from "../../../../../shared/errors";
import type { AdminCategoryEntity } from "../../../domain/entities/category.entity";
import type { CategoryRepositoryPort } from "../../ports/category-repository.port";

export class GetCategoryAdminUseCase {
  constructor(private readonly categoryRepository: CategoryRepositoryPort) {}

  async execute(id: string): Promise<AdminCategoryEntity> {
    const category = await this.categoryRepository.findByIdForAdmin(id);
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    return category;
  }
}
