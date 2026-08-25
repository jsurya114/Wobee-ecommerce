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
}
