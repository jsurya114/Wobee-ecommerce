import type { OrderEntity, OrderSummaryEntity, AdminOrderSummaryEntity } from "../../domain/entities/order.entity";

export interface CreateOrderItemInput {
  variantId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  color: string;
  size: string;
  weightGrams: number;
  unitRatePerKgPaise: number;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  taxAmountPaise: number;
  /** Coupon discount allocated to this line (largest-remainder split of the order-level discount across eligible lines). 0 when no coupon. */
  discountPaise: number;
}

export interface CreateOrderInput {
  orderNumber: string;
  userId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingSnapshot: OrderEntity["shippingSnapshot"];
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  totalWeightGrams: number;
  paymentMethod: OrderEntity["paymentMethod"];
  items: CreateOrderItemInput[];
}

export interface TransitionOrderStatusResult {
  /** false when the order wasn't in `from` at the time of the update (already transitioned, e.g. by a concurrent/duplicate webhook) — the caller treats this as an idempotent no-op, not an error. */
  changed: boolean;
  order: OrderEntity;
}

export interface ListOrdersFilter {
  status?: OrderEntity["status"];
  search?: string;
  page: number;
  pageSize: number;
}

export interface ListOrdersResult {
  items: AdminOrderSummaryEntity[];
  total: number;
}

/** Week 2 Day 8 Part 2 (week2 (1).md §12's "Best Sellers") — one variant's total units sold, "sold" meaning the same real-purchase status set hasUserPurchasedProduct already uses below. */
export interface VariantSaleQuantity {
  variantId: string;
  quantitySold: number;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface OrderRepositoryPort {
  /** Runs inside the caller-supplied checkout transaction (`tx` — see TransactionPort) so a duplicate orderNumber (astronomically unlikely, but not impossible) rolls back cleanly for the use-case to retry with a fresh one. */
  createWithItems(input: CreateOrderInput, tx: unknown): Promise<OrderEntity>;
  findById(orderId: string): Promise<OrderEntity | null>;
  /** Newest first — "My Orders" list (week1_excecution_prompt.md Day 5). */
  findSummariesByUserId(userId: string): Promise<OrderSummaryEntity[]>;
  /**
   * Conditional update (`WHERE id = ? AND status = ?`) — the idempotency
   * primitive `payments`' order-confirmation/failure use-cases build on.
   * `changed: false` (not an error) is exactly the "duplicate webhook
   * delivery, already processed" case (ADR-014's mandatory dedup test).
   */
  transitionStatus(
    orderId: string,
    from: OrderEntity["status"],
    to: OrderEntity["status"],
    tx: unknown,
    extraFields?: Partial<
      Pick<OrderEntity, "trackingNumber" | "carrier" | "shippedAt" | "deliveredAt" | "cancelledAt" | "cancellationReason">
    >,
  ): Promise<TransitionOrderStatusResult>;
  /** Admin order list (ADR-025's admin order view) — no userId filter, unlike findSummariesByUserId. */
  findAllPaginated(filter: ListOrdersFilter): Promise<ListOrdersResult>;
  /**
   * Week 2 Day 4's verified-purchase check (week2 (1).md §8) — true if this
   * user has an order, in a status that means the purchase actually
   * happened (not still pending payment, not failed, not cancelled),
   * containing a variant of this product. Deliberately excludes
   * PENDING_PAYMENT/PAYMENT_FAILED/CANCELLED — those never delivered a
   * product to review.
   */
  hasUserPurchasedProduct(userId: string, productId: string): Promise<boolean>;
  /** Week 2 Day 6 (week2 (1).md §11) — `returns`' one write onto Order, through this exported use-case (ADR-010: `returns` never touches the Order table directly). Purely denormalized for admin filtering (schema.prisma's own comment on `Order.hasActiveReturn`) — never read by any business rule. */
  setHasActiveReturn(orderId: string, value: boolean): Promise<void>;
  /**
   * Week 2 Day 8 Part 2 (week2 (1).md §12) — top variants by units sold,
   * across every order in a real-purchase status (same set
   * hasUserPurchasedProduct uses), highest quantity first. Grouped at the
   * variant level (this module's own grain — OrderItem has no productId of
   * its own) because collapsing to product-level requires `products`' own
   * variant→product mapping, which lives one layer up in the `home` module's
   * composition, not here (ADR-010: orders never reaches into
   * product_variants for anything beyond its own foreign key).
   */
  findBestSellingVariantQuantities(limit: number): Promise<VariantSaleQuantity[]>;
}
