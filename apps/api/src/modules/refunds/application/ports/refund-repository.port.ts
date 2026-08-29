import type { RefundEntity } from "../../domain/entities/refund.entity";

export interface CreateRefundInput {
  orderId: string;
  /** Week 2 Day 6 (week2 (1).md §12) — null/omitted for the admin-cancellation path, set for a return-driven refund. */
  returnId?: string;
  provider: RefundEntity["provider"];
  status: RefundEntity["status"];
  amountPaise: number;
  providerRefundId?: string;
}

export interface RefundRepositoryPort {
  findByOrderId(orderId: string): Promise<RefundEntity | null>;
  /** Idempotency key for the return-refund path — one Refund row per Return, same role `findByOrderId` plays for cancellation. */
  findByReturnId(returnId: string): Promise<RefundEntity | null>;
  create(input: CreateRefundInput): Promise<RefundEntity>;
  /** Manual-completion path (MarkReturnRefundedUseCase) — flips an existing INITIATED/FAILED row to COMPLETED without a gateway call. */
  markCompletedByReturnId(returnId: string): Promise<void>;
}
