import type { CollectionEntity } from "../../domain/entities/collection.entity";

export interface CreateCollectionInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface CollectionRepositoryPort {
  findActiveCollections(): Promise<CollectionEntity[]>;
  findIdBySlug(slug: string): Promise<string | null>;
  /** Customer-facing detail (Week 2 Day 2) — active collections only, same as findActiveCollections. */
  findActiveBySlug(slug: string): Promise<CollectionEntity | null>;

  /** Admin surface — includes inactive collections, unlike every customer-facing read above. */
  findAllForAdmin(): Promise<CollectionEntity[]>;
  findByIdForAdmin(id: string): Promise<CollectionEntity | null>;
  create(input: CreateCollectionInput): Promise<CollectionEntity>;
  update(id: string, input: UpdateCollectionInput): Promise<CollectionEntity>;
  setActive(id: string, isActive: boolean): Promise<CollectionEntity>;

  /** Ordered by sortOrder ascending — the admin-controlled rail order (week2 (1).md §4 "Reorder products"). */
  listProductIds(collectionId: string): Promise<string[]>;
  /** Idempotent — assigning an already-assigned product is a no-op, not an error (keeps the admin action simple to retry). */
  assignProduct(collectionId: string, productId: string): Promise<void>;
  /** Idempotent — removing a product that isn't assigned is a no-op. */
  removeProduct(collectionId: string, productId: string): Promise<void>;
  /** Writes sortOrder = array index for each id, in one transaction. Caller (the use-case) has already validated orderedProductIds is exactly the collection's current membership. */
  reorderProducts(collectionId: string, orderedProductIds: string[]): Promise<void>;
}
