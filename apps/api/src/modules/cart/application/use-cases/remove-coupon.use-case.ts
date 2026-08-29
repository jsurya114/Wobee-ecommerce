import type { CartRepositoryPort } from "../ports/cart-repository.port";

/** Always succeeds, even if no coupon was applied — same idempotent-no-op treatment as other "remove" actions in this codebase (e.g. CollectionRepository.removeProduct). */
export class RemoveCouponUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  execute(cartId: string): Promise<void> {
    return this.cartRepository.setCouponCode(cartId, null);
  }
}
