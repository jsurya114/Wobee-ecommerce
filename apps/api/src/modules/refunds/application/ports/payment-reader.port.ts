export interface PaymentForRefundView {
  id: string;
  provider: "RAZORPAY" | "COD";
  status: "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
  amountPaise: number;
  razorpayPaymentId: string | null;
  /** COD shipping upfront (2026-09-28) — the part of a COD payment captured online (its delivery fee); null otherwise. */
  upfrontAmountPaise?: number | null;
}

/** Narrow read-only dependency on `payments` (ADR-025) — decides purely from the actual payment record, never from the order's own belief about payment method. */
export interface PaymentReaderPort {
  findByOrderId(orderId: string): Promise<PaymentForRefundView | null>;
}
