import type { WishlistRepositoryPort } from "../ports/wishlist-repository.port";

/** Authorization (week2 (1).md §5 — "a customer can't modify another customer's wishlist"): wishlistId is always resolved from the CALLER's own userId, never taken from the request, so an itemId belonging to a different account's wishlist can never match — see WishlistRepositoryPort's own doc comment. */
export class RemoveWishlistItemUseCase {
  constructor(private readonly wishlistRepository: WishlistRepositoryPort) {}

  async execute(userId: string, itemId: string): Promise<void> {
    const wishlistId = await this.wishlistRepository.findOrCreateWishlistId(userId);
    await this.wishlistRepository.removeItem(wishlistId, itemId);
  }
}
