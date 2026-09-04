export interface LockedCart {
  status: "ACTIVE" | "MERGED" | "CONVERTED" | "ABANDONED";
}

/** Narrow port for this module's dependency on `cart` — marks the cart CONVERTED inside the same checkout transaction the order is created in (see TransactionPort). */
export interface CartWriterPort {
  markConverted(cartId: string, tx: unknown): Promise<void>;
  /**
   * Week 3 Day 1 hardening — row-locks the cart inside the checkout
   * transaction and returns its current status under that lock. Must be
   * called, and its result checked, before any other checkout side effect
   * (coupon lock, inventory reservation, order creation) — see
   * cart's own CartRepositoryPort.lockCartForCheckout for why.
   */
  lockForCheckout(cartId: string, tx: unknown): Promise<LockedCart | null>;
}
