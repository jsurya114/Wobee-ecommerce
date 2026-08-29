import { Prisma, prisma } from "@woobe/database";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { WishlistRepositoryPort } from "../../application/ports/wishlist-repository.port";
import type { WishlistItemEntity } from "../../domain/entities/wishlist-item.entity";

const ITEM_SELECT = { id: true, productId: true, variantId: true, createdAt: true } as const;

/**
 * ADR-010: the ONLY file in the wishlist module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class WishlistRepository implements WishlistRepositoryPort {
  async findOrCreateWishlistId(userId: string): Promise<string> {
    // upsert, not findFirst-then-create — Wishlist.userId is unique, so a
    // plain create on a second call would 500 on the constraint under
    // concurrent first-use (two requests racing to lazily create the same
    // user's wishlist); upsert makes this idempotent by construction.
    const wishlist = await prisma.wishlist.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    });
    return wishlist.id;
  }

  async findItems(wishlistId: string): Promise<WishlistItemEntity[]> {
    return prisma.wishlistItem.findMany({
      where: { wishlistId },
      orderBy: { createdAt: "desc" },
      select: ITEM_SELECT,
    });
  }

  async findItemByProduct(wishlistId: string, productId: string): Promise<WishlistItemEntity | null> {
    return prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId, productId } },
      select: ITEM_SELECT,
    });
  }

  async findItemById(wishlistId: string, itemId: string): Promise<WishlistItemEntity | null> {
    // Scoped by BOTH id and wishlistId (not findUnique on id alone) — the
    // authorization mechanism: an itemId from another account's wishlist
    // simply doesn't match and resolves to null, same as not existing.
    return prisma.wishlistItem.findFirst({ where: { id: itemId, wishlistId }, select: ITEM_SELECT });
  }

  async addItem(wishlistId: string, productId: string, variantId: string | null): Promise<WishlistItemEntity> {
    try {
      return await prisma.wishlistItem.create({
        data: { wishlistId, productId, variantId },
        select: ITEM_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 on (wishlistId, productId) — the schema-enforced duplicate
        // guard (WishlistItem's own @@unique) firing; surfaced as a clean
        // 409, never a raw 500 (week2 (1).md §5's own requirement).
        if (error.code === "P2002") {
          throw new ConflictError("This product is already in your wishlist");
        }
        // P2003 — productId/variantId FK violation (unknown product/variant).
        if (error.code === "P2003") {
          throw new NotFoundError("Product or variant not found");
        }
      }
      throw error;
    }
  }

  async removeItem(wishlistId: string, itemId: string): Promise<void> {
    const result = await prisma.wishlistItem.deleteMany({ where: { id: itemId, wishlistId } });
    if (result.count === 0) {
      throw new NotFoundError("Wishlist item not found");
    }
  }
}
