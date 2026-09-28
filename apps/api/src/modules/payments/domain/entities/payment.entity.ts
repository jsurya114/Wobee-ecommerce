export type PaymentStatus = "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
export type PaymentProvider = "RAZORPAY" | "COD";

export interface PaymentEntity {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  /** COD shipping upfront (2026-09-28) — for a COD payment, the part charged online (the delivery fee); null otherwise. */
  upfrontAmountPaise: number | null;
}
