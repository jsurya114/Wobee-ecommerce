import { prisma } from "@woobe/database";
import type { CategoryRepositoryPort } from "../../application/ports/category-repository.port";
import type { CategoryEntity } from "../../domain/entities/category.entity";

/**
 * ADR-010: the ONLY file in the categories module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class CategoryRepository implements CategoryRepositoryPort {
  async findActiveCategories(): Promise<CategoryEntity[]> {
    const rows = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, sortOrder: true, imageUrl: true, pricingMode: true },
    });
    return rows;
  }

  async findIdBySlug(slug: string): Promise<string | null> {
    const row = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    return row?.id ?? null;
  }
}
