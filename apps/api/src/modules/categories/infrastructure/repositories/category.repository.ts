import { Prisma, prisma } from "@woobe/database";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type {
  CategoryRepositoryPort,
  CreateCategoryData,
  UpdateCategoryData,
} from "../../application/ports/category-repository.port";
import type { AdminCategoryEntity, CategoryEntity } from "../../domain/entities/category.entity";

const ADMIN_SELECT = {
  id: true,
  name: true,
  slug: true,
  sortOrder: true,
  imageUrl: true,
  isActive: true,
  pricingMode: true,
  _count: { select: { products: true } },
} as const;

function toAdminEntity(row: {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  imageUrl: string | null;
  isActive: boolean;
  pricingMode: AdminCategoryEntity["pricingMode"];
  _count: { products: number };
}): AdminCategoryEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
    pricingMode: row.pricingMode,
    productCount: row._count.products,
  };
}

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

  async findAllForAdmin(): Promise<AdminCategoryEntity[]> {
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: ADMIN_SELECT });
    return rows.map(toAdminEntity);
  }

  async findByIdForAdmin(id: string): Promise<AdminCategoryEntity | null> {
    const row = await prisma.category.findUnique({ where: { id }, select: ADMIN_SELECT });
    return row ? toAdminEntity(row) : null;
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.category.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async createCategory(data: CreateCategoryData): Promise<AdminCategoryEntity> {
    try {
      // New categories append to the end of the display order.
      const count = await prisma.category.count();
      const created = await prisma.category.create({
        data: { name: data.name, slug: data.slug, imageUrl: data.imageUrl ?? null, sortOrder: count },
        select: ADMIN_SELECT,
      });
      return toAdminEntity(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(`A category with slug "${data.slug}" already exists`);
      }
      throw error;
    }
  }

  async updateCategory(id: string, data: UpdateCategoryData): Promise<AdminCategoryEntity> {
    try {
      const updated = await prisma.category.update({
        where: { id },
        data: { name: data.name, slug: data.slug, imageUrl: data.imageUrl },
        select: ADMIN_SELECT,
      });
      return toAdminEntity(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictError(`A category with slug "${data.slug}" already exists`);
        }
        if (error.code === "P2025") {
          throw new NotFoundError("Category not found");
        }
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<AdminCategoryEntity> {
    try {
      const updated = await prisma.category.update({ where: { id }, data: { isActive }, select: ADMIN_SELECT });
      return toAdminEntity(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Category not found");
      }
      throw error;
    }
  }

  async reorder(categoryIds: string[]): Promise<void> {
    await prisma.$transaction(
      categoryIds.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })),
    );
  }
}
