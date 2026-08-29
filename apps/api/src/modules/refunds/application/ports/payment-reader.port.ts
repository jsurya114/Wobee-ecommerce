export interface PaymentForRefundView {
  id: string;
  provider: "RAZORPAY" | "COD";
  status: "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
  amountPaise: number;
  razorpayPaymentId: string | null;
}

/** Narrow read-only dependency on `payments` (ADR-025) — decides purely from the actual payment record, never from the order's own belief about payment method. */
export interface PaymentReaderPort {
  findByOrderId(orderId: string): Promise<PaymentForRefundView | null>;
}
