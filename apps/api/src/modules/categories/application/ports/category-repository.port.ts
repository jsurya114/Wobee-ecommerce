import type { CategoryEntity } from "../../domain/entities/category.entity";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface CategoryRepositoryPort {
  findActiveCategories(): Promise<CategoryEntity[]>;
  findIdBySlug(slug: string): Promise<string | null>;
}
