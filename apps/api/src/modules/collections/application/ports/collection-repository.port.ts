import type { CollectionEntity } from "../../domain/entities/collection.entity";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface CollectionRepositoryPort {
  findActiveCollections(): Promise<CollectionEntity[]>;
  findIdBySlug(slug: string): Promise<string | null>;
}
