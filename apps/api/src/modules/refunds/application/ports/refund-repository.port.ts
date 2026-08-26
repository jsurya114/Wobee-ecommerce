import type { RefundEntity } from "../../domain/entities/refund.entity";

export interface CreateRefundInput {
  orderId: string;
  provider: RefundEntity["provider"];
  status: RefundEntity["status"];
  amountPaise: number;
  providerRefundId?: string;
}

export interface RefundRepositoryPort {
  findByOrderId(orderId: string): Promise<RefundEntity | null>;
  create(input: CreateRefundInput): Promise<RefundEntity>;
}
