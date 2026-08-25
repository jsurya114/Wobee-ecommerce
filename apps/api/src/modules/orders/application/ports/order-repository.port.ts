import type { OrderEntity, OrderSummaryEntity } from "../../domain/entities/order.entity";

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
  transitionStatus(orderId: string, from: OrderEntity["status"], to: OrderEntity["status"], tx: unknown): Promise<TransitionOrderStatusResult>;
}
