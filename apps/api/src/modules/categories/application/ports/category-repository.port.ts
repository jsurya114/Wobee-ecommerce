import type { AdminCategoryEntity, CategoryEntity } from "../../domain/entities/category.entity";

export interface CreateCategoryData {
  name: string;
  slug: string;
  imageUrl?: string | null;
}

export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  imageUrl?: string | null;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface CategoryRepositoryPort {
  findActiveCategories(): Promise<CategoryEntity[]>;
  findIdBySlug(slug: string): Promise<string | null>;

  // Admin management (2026-09-02) — below.
  /** All categories (active and inactive), ordered by sortOrder — the admin list, unlike the public findActiveCategories. */
  findAllForAdmin(): Promise<AdminCategoryEntity[]>;
  findByIdForAdmin(id: string): Promise<AdminCategoryEntity | null>;
  /** `excludeId` lets an update re-save its own unchanged slug without false-positiving as taken (same pattern as ProductRepository.slugExists). */
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  createCategory(data: CreateCategoryData): Promise<AdminCategoryEntity>;
  updateCategory(id: string, data: UpdateCategoryData): Promise<AdminCategoryEntity>;
  setActive(id: string, isActive: boolean): Promise<AdminCategoryEntity>;
  /** Persists sortOrder as the given array's index — same "whole order in one call" shape as ReorderCollectionProductsUseCase. */
  reorder(categoryIds: string[]): Promise<void>;
}
