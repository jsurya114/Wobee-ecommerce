export interface CartRecord {
  id: string;
  userId: string | null;
  status: "ACTIVE" | "MERGED" | "CONVERTED" | "ABANDONED";
}

export interface CartItemRecord {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1). Owns
 * Cart/CartItem only (ADR-010) — never Product/ProductVariant/Inventory,
 * those are read through this module's other ports.
 */
export interface CartRepositoryPort {
  findActiveCartByUserId(userId: string): Promise<CartRecord | null>;
  findActiveCartById(cartId: string): Promise<CartRecord | null>;
  /** Any status, not just ACTIVE — `Cart.userId` is DB-unique (one cart row ever per user), so this is how GetOrCreateCartUseCase finds a past (e.g. CONVERTED) cart to reactivate instead of trying to INSERT a second row and violating that constraint. */
  findCartByUserId(userId: string): Promise<CartRecord | null>;
  createCart(params: { userId?: string }): Promise<CartRecord>;
  /** Resets a non-ACTIVE cart (CONVERTED after a past checkout) back to ACTIVE for a new shopping session, clearing its old items — those already live on the Order/OrderItem snapshot, not meant to reappear in a fresh cart. */
  reactivateCart(cartId: string): Promise<CartRecord>;
  markCartMerged(cartId: string): Promise<void>;
  /**
   * ADR-015: called from inside orders' checkout Unit-of-Work transaction
   * (`tx` is that opaque handle — see orders/application/ports/transaction.port.ts)
   * so "order created" and "cart converted" commit or roll back together.
   */
  markCartConverted(cartId: string, tx: unknown): Promise<void>;
  /**
   * Week 3 Day 1 hardening — `SELECT ... FOR UPDATE` on the cart row itself,
   * same row-locking pattern ADR-015 already uses for inventory. Must be the
   * FIRST thing CheckoutUseCase does inside its transaction: two checkout
   * requests racing for the same cart (a double-click, a client retry) both
   * pass the pre-transaction `getCart`/availability checks — nothing there
   * is locked — so without this lock both could reserve inventory and
   * create a separate order from the identical cart. Whichever transaction
   * gets the lock first serializes the second behind it; the second then
   * re-reads `status` under the lock and (via CheckoutUseCase) rejects
   * cleanly once it sees CONVERTED rather than silently double-booking.
   * Returns null only if the cart row itself is gone (shouldn't happen —
   * carts are never deleted, only status-transitioned).
   */
  lockCartForCheckout(cartId: string, tx: unknown): Promise<CartRecord | null>;

  findItems(cartId: string): Promise<CartItemRecord[]>;
  findItem(cartId: string, itemId: string): Promise<CartItemRecord | null>;
  findItemByVariant(cartId: string, variantId: string): Promise<CartItemRecord | null>;
  addItem(cartId: string, variantId: string, quantity: number): Promise<CartItemRecord>;
  setItemQuantity(itemId: string, quantity: number): Promise<CartItemRecord>;
  /** Re-points an existing line at a different variant of the same product (cart "change size") — never called for a variant that already has its own line, see ChangeItemVariantUseCase. */
  setItemVariant(itemId: string, variantId: string): Promise<CartItemRecord>;
  removeItem(itemId: string): Promise<void>;

  /** Week 2 Day 5 (week2 (1).md §9) — the applied coupon's code only, same "store the reference, recompute the money live" rule as everything else on Cart (see Cart.couponCode's own schema comment). null when none is applied. */
  findCouponCode(cartId: string): Promise<string | null>;
  setCouponCode(cartId: string, code: string | null): Promise<void>;
}
