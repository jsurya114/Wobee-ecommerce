export interface ReturnOrderItemView {
  id: string;
  variantId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPricePaise: number;
  taxAmountPaise: number;
}

export interface ReturnOrderView {
  id: string;
  userId: string | null;
  status: string;
  deliveredAt: Date | null;
  items: ReturnOrderItemView[];
  /** Week 2 Day 8 (week2 (1).md §20) — needed to build the RETURN_APPROVED/REFUND_PROCESSED notification payload; not used for anything else this port already serves. */
  contactEmail: string;
  orderNumber: string;
}

/**
 * Narrow port onto `orders` (week2 (1).md §11). Two lookups, not one,
 * mirroring the two already-exported use-cases on the orders side:
 * `forCustomer` keeps the customer-facing ownership check (order not
 * found vs. not yours are indistinguishable, same posture as
 * GetOrderUseCase's own doc comment) baked into a single call, and
 * `forAdmin` skips it (staff can look up any order this module needs to
 * validate a return against).
 */
export interface OrderReaderPort {
  forCustomer(orderId: string, userId: string): Promise<ReturnOrderView>;
  forAdmin(orderId: string): Promise<ReturnOrderView>;
}
