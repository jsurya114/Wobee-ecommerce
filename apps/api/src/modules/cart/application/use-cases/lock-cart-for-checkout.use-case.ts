import type { CartRecord, CartRepositoryPort } from "../ports/cart-repository.port";

/**
 * Exported from cart.module.ts for cross-module use (same pattern as
 * MarkCartConvertedUseCase) — orders' checkout use-case calls this as the
 * FIRST thing inside its own transaction, before touching coupons or
 * inventory. See CartRepositoryPort.lockCartForCheckout's own doc comment
 * for the concurrency hole this closes.
 */
export class LockCartForCheckoutUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  execute(cartId: string, tx: unknown): Promise<CartRecord | null> {
    return this.cartRepository.lockCartForCheckout(cartId, tx);
  }
}
