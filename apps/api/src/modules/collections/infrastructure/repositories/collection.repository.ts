import { Prisma, prisma } from "@woobe/database";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type {
  CollectionRepositoryPort,
  CreateCollectionInput,
  UpdateCollectionInput,
} from "../../application/ports/collection-repository.port";
import type { CollectionEntity } from "../../domain/entities/collection.entity";

const SELECT_FIELDS = { id: true, name: true, slug: true, description: true, isActive: true } as const;

/**
 * ADR-010: the ONLY file in the collections module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class CollectionRepository implements CollectionRepositoryPort {
  async findActiveCollections(): Promise<CollectionEntity[]> {
    // No admin-configurable ordering for collections themselves (unlike
    // Category.sortOrder, or ProductCollection.sortOrder this same day adds
    // for products WITHIN a collection) — alphabetical stays the
    // deterministic default (see Week 2 Day 1's identical comment here).
    const rows = await prisma.collection.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        ...SELECT_FIELDS,
        // Cover image (2026-08-31 card redesign) — the top-sorted assigned
        // product's primary image. One extra join, still one query.
        products: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { product: { select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.isActive,
      coverImageUrl: row.products[0]?.product.images[0]?.url ?? null,
    }));
  }

  async findIdBySlug(slug: string): Promise<string | null> {
    const row = await prisma.collection.findUnique({ where: { slug }, select: { id: true } });
    return row?.id ?? null;
  }

  async findActiveBySlug(slug: string): Promise<CollectionEntity | null> {
    return prisma.collection.findFirst({ where: { slug, isActive: true }, select: SELECT_FIELDS });
  }

  async findAllForAdmin(): Promise<CollectionEntity[]> {
    return prisma.collection.findMany({ orderBy: { name: "asc" }, select: SELECT_FIELDS });
  }

  async findByIdForAdmin(id: string): Promise<CollectionEntity | null> {
    return prisma.collection.findUnique({ where: { id }, select: SELECT_FIELDS });
  }

  async create(input: CreateCollectionInput): Promise<CollectionEntity> {
    try {
      return await prisma.collection.create({
        data: { name: input.name, slug: input.slug, description: input.description ?? null },
        select: SELECT_FIELDS,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(`A collection with slug "${input.slug}" already exists`);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateCollectionInput): Promise<CollectionEntity> {
    try {
      return await prisma.collection.update({
        where: { id },
        data: { name: input.name, slug: input.slug, description: input.description },
        select: SELECT_FIELDS,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictError(`A collection with slug "${input.slug}" already exists`);
        }
        if (error.code === "P2025") {
          throw new NotFoundError("Collection not found");
        }
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<CollectionEntity> {
    try {
      return await prisma.collection.update({ where: { id }, data: { isActive }, select: SELECT_FIELDS });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Collection not found");
      }
      throw error;
    }
  }

  async listProductIds(collectionId: string): Promise<string[]> {
    const rows = await prisma.productCollection.findMany({
      where: { collectionId },
      orderBy: { sortOrder: "asc" },
      select: { productId: true },
    });
    return rows.map((row) => row.productId);
  }

  async assignProduct(collectionId: string, productId: string): Promise<void> {
    try {
      // sortOrder for a newly-assigned product: append to the end. Not
      // wrapped in a serializable transaction against concurrent assigns —
      // this is a low-concurrency admin action (one operator at a time in
      // practice), and a rare sortOrder collision just means two products
      // tie for a rail position, not a correctness bug (reorder fixes it).
      const count = await prisma.productCollection.count({ where: { collectionId } });
      await prisma.productCollection.upsert({
        where: { productId_collectionId: { productId, collectionId } },
        update: {}, // already assigned — idempotent no-op, keep its existing sortOrder
        create: { productId, collectionId, sortOrder: count },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError("Product not found");
      }
      throw error;
    }
  }

  async removeProduct(collectionId: string, productId: string): Promise<void> {
    // deleteMany, not delete — removing a product that isn't assigned is a
    // no-op (idempotent), not a 404; the collection's own existence is
    // validated by the use-case one layer up.
    await prisma.productCollection.deleteMany({ where: { collectionId, productId } });
  }

  async reorderProducts(collectionId: string, orderedProductIds: string[]): Promise<void> {
    await prisma.$transaction(
      orderedProductIds.map((productId, index) =>
        prisma.productCollection.update({
          where: { productId_collectionId: { productId, collectionId } },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
