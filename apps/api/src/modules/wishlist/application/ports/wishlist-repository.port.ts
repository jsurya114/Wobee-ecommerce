import type { WishlistItemEntity } from "../../domain/entities/wishlist-item.entity";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 *
 * Every method here is scoped by a wishlistId already resolved from the
 * CALLER's own userId (Wishlist.userId is unique — one wishlist per
 * account, DEVELOPMENT_RULES.md-adjacent authorization-by-construction: no
 * method here accepts a raw wishlistId from a request param, so there is no
 * URL a customer could hand-edit to reach another customer's wishlist).
 */
export interface WishlistRepositoryPort {
  /** Creates the row on first use — every logged-in customer gets a wishlist lazily, not at registration. */
  findOrCreateWishlistId(userId: string): Promise<string>;
  findItems(wishlistId: string): Promise<WishlistItemEntity[]>;
  findItemByProduct(wishlistId: string, productId: string): Promise<WishlistItemEntity | null>;
  /** Scoped by BOTH itemId and wishlistId — the authorization mechanism for remove/move-to-cart (see this port's own doc comment). */
  findItemById(wishlistId: string, itemId: string): Promise<WishlistItemEntity | null>;
  addItem(wishlistId: string, productId: string, variantId: string | null): Promise<WishlistItemEntity>;
  /** Throws NotFoundError if itemId doesn't belong to wishlistId — see this port's own doc comment. */
  removeItem(wishlistId: string, itemId: string): Promise<void>;
}
