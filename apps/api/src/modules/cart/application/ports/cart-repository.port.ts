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
  createCart(params: { userId?: string }): Promise<CartRecord>;
  markCartMerged(cartId: string): Promise<void>;
  /**
   * ADR-015: called from inside orders' checkout Unit-of-Work transaction
   * (`tx` is that opaque handle — see orders/application/ports/transaction.port.ts)
   * so "order created" and "cart converted" commit or roll back together.
   */
  markCartConverted(cartId: string, tx: unknown): Promise<void>;

  findItems(cartId: string): Promise<CartItemRecord[]>;
  findItem(cartId: string, itemId: string): Promise<CartItemRecord | null>;
  findItemByVariant(cartId: string, variantId: string): Promise<CartItemRecord | null>;
  addItem(cartId: string, variantId: string, quantity: number): Promise<CartItemRecord>;
  setItemQuantity(itemId: string, quantity: number): Promise<CartItemRecord>;
  removeItem(itemId: string): Promise<void>;
}
