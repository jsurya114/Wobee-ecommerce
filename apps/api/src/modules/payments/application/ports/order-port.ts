export interface OrderForPayment {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: string;
  paymentMethod: "RAZORPAY" | "COD";
  totalPaise: number;
  shippingFeePaise: number;
  /** Non-null only for a COD order that must prepay its delivery fee online (2026-09-28). */
  payableOnDeliveryPaise: number | null;
  shippingPaidUpfront: boolean;
  items: { variantId: string; quantity: number }[];
}

export interface TransitionResult {
  changed: boolean;
}

/**
 * Narrow port for this module's dependency on `orders` — payments never
 * writes to the Order table itself (ARCHITECTURE.md §3.3); every state
 * transition goes through orders' own use-cases, wired here as trivial
 * pass-through adapters in payments.module.ts.
 */
export interface OrderPort {
  getOrder(orderId: string): Promise<OrderForPayment | null>;
  /** `options.shippingPaidUpfront` — the capture being confirmed is a COD order's prepaid delivery fee. */
  confirm(orderId: string, tx: unknown, options?: { shippingPaidUpfront?: boolean }): Promise<TransitionResult>;
  markPaymentFailed(orderId: string, tx: unknown): Promise<TransitionResult>;
  /**
   * Week 2 Day 8 (week2 (1).md §20) — called AFTER the caller's own
   * transaction has committed (no `tx` param, deliberately), carrying only
   * an orderId and event type, never any contact PII: `orders` itself is
   * what builds the actual notification (it owns contactEmail), same
   * boundary this port already keeps for everything else.
   */
  notifyOrderEvent(orderId: string, type: "ORDER_CONFIRMED" | "PAYMENT_FAILED"): Promise<void>;
}
