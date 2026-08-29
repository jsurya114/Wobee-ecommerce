import type { CartRepositoryPort } from "../ports/cart-repository.port";

/**
 * Exported from cart.module.ts for cross-module use — orders' checkout
 * use-case calls this, inside its own transaction, right after order
 * creation succeeds (see CartRepositoryPort.markCartConverted's own comment).
 */
export class MarkCartConvertedUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  execute(cartId: string, tx: unknown): Promise<void> {
    return this.cartRepository.markCartConverted(cartId, tx);
  }
}
