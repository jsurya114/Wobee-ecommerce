import type { CartRepositoryPort } from "../ports/cart-repository.port";

export interface GetOrCreateCartInput {
  userId?: string;
  guestCartId?: string;
}

export interface GetOrCreateCartResult {
  cartId: string;
  /** true when this cart is guest-owned — the controller sets/refreshes the cart_id cookie only in this case. */
  isGuest: boolean;
}

/**
 * Cart.id IS the cart_id issued in the signed httpOnly cookie (ADR-011).
 * A logged-in user is looked up by their (unique) userId, ignoring any
 * stale guest cookie — merging that guest cart in is a separate, explicit
 * step (MergeGuestCartUseCase), not implicit on every cart read.
 */
export class GetOrCreateCartUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  async execute(input: GetOrCreateCartInput): Promise<GetOrCreateCartResult> {
    if (input.userId) {
      const existingActive = await this.cartRepository.findActiveCartByUserId(input.userId);
      if (existingActive) {
        return { cartId: existingActive.id, isGuest: false };
      }

      // `Cart.userId` is DB-unique — a user who already has a past (e.g.
      // CONVERTED, after a completed checkout) cart row can't get a second
      // one via createCart(), that would violate the constraint. Reactivate
      // the existing row for a fresh session instead of inserting a new one.
      const existingAny = await this.cartRepository.findCartByUserId(input.userId);
      const cart = existingAny
        ? await this.cartRepository.reactivateCart(existingAny.id)
        : await this.cartRepository.createCart({ userId: input.userId });
      return { cartId: cart.id, isGuest: false };
    }

    if (input.guestCartId) {
      const existing = await this.cartRepository.findActiveCartById(input.guestCartId);
      if (existing && existing.userId === null) {
        return { cartId: existing.id, isGuest: true };
      }
    }

    const cart = await this.cartRepository.createCart({});
    return { cartId: cart.id, isGuest: true };
  }
}
