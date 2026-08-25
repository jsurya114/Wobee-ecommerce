export interface OrderForPayment {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: string;
  paymentMethod: "RAZORPAY" | "COD";
  totalPaise: number;
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
  confirm(orderId: string, tx: unknown): Promise<TransitionResult>;
  markPaymentFailed(orderId: string, tx: unknown): Promise<TransitionResult>;
}
