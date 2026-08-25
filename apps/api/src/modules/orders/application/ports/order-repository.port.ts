import type { OrderEntity } from "../../domain/entities/order.entity";

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

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface OrderRepositoryPort {
  /** Runs inside the caller-supplied checkout transaction (`tx` — see TransactionPort) so a duplicate orderNumber (astronomically unlikely, but not impossible) rolls back cleanly for the use-case to retry with a fresh one. */
  createWithItems(input: CreateOrderInput, tx: unknown): Promise<OrderEntity>;
}
