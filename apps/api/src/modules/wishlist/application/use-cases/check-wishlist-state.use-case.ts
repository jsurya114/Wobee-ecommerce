import type { WishlistRepositoryPort } from "../ports/wishlist-repository.port";

export interface WishlistStateResult {
  inWishlist: boolean;
  itemId: string | null;
}

/** PDP's "is this already saved" check (week2 (1).md §5). */
export class CheckWishlistStateUseCase {
  constructor(private readonly wishlistRepository: WishlistRepositoryPort) {}

  async execute(userId: string, productId: string): Promise<WishlistStateResult> {
    const wishlistId = await this.wishlistRepository.findOrCreateWishlistId(userId);
    const item = await this.wishlistRepository.findItemByProduct(wishlistId, productId);
    return { inWishlist: item !== null, itemId: item?.id ?? null };
  }
}
