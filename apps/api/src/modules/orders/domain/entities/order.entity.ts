import type { OrderStatus, PaymentMethod } from "@woobe/types";

export interface OrderAddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderItemEntity {
  id: string;
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

/**
 * Every money/weight/tax field is a SNAPSHOT taken at checkout time
 * (plan.md §6, schema.prisma's own comment on the Order model) — never
 * recomputed from current product/pricing/settings state after the fact.
 */
export interface OrderEntity {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: OrderStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingSnapshot: OrderAddressSnapshot;
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  totalWeightGrams: number;
  paymentMethod: PaymentMethod;
  placedAt: Date;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  /** True while a non-terminal Return exists against this order (returns' own SetOrderHasActiveReturnUseCase, Week 2 Day 6) — surfaced read-only here for admin order-detail's "view return" link (Week 2 Day 7). */
  hasActiveReturn: boolean;
  items: OrderItemEntity[];
}

/** Lighter shape for "My Orders" list views — status/total only, no line-item detail (week1_excecution_prompt.md Day 5: "status only, no returns/refunds UI yet"). */
export interface OrderSummaryEntity {
  id: string;
  orderNumber: string;
  status: OrderEntity["status"];
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemCount: number;
  placedAt: Date;
}

/** Admin order-list row — unlike OrderSummaryEntity (customer's own "My Orders"), includes contact info for search/display and is never scoped by userId. */
export interface AdminOrderSummaryEntity {
  id: string;
  orderNumber: string;
  status: OrderEntity["status"];
  paymentMethod: PaymentMethod;
  contactName: string;
  contactEmail: string;
  totalPaise: number;
  itemCount: number;
  placedAt: Date;
}
