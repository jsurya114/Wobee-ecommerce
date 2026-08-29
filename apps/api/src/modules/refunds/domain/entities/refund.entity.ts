import type { PaymentMethod, RefundStatus } from "@woobe/types";

export interface RefundEntity {
  id: string;
  orderId: string;
  returnId: string | null;
  provider: PaymentMethod;
  status: RefundStatus;
  amountPaise: number;
  providerRefundId: string | null;
  createdAt: Date;
}
