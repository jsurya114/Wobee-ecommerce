import { prisma } from "@woobe/database";
import type { CollectionRepositoryPort } from "../../application/ports/collection-repository.port";
import type { CollectionEntity } from "../../domain/entities/collection.entity";

/**
 * ADR-010: the ONLY file in the collections module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class CollectionRepository implements CollectionRepositoryPort {
  async findActiveCollections(): Promise<CollectionEntity[]> {
    // No admin-configurable ordering yet (unlike Category.sortOrder) —
    // reordering collections isn't in Day 1's listing-only scope (week2
    // (1).md §4 covers admin reorder for Day 2). Alphabetical is a
    // deterministic, unsurprising default until that lands.
    const rows = await prisma.collection.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, description: true },
    });
    return rows;
  }

  async findIdBySlug(slug: string): Promise<string | null> {
    const row = await prisma.collection.findUnique({ where: { slug }, select: { id: true } });
    return row?.id ?? null;
  }
}
