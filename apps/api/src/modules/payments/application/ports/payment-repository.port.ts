import type { PaymentEntity, PaymentProvider, PaymentStatus } from "../../domain/entities/payment.entity";

export interface CreatePaymentInput {
  orderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountPaise: number;
  razorpayOrderId?: string;
}

export interface UpdatePaymentInput {
  status: PaymentStatus;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

/** Admin analytics dashboard (2026-09-03). */
export interface PaymentCollectionSummary {
  /** Money actually captured (any provider) — the real "collected revenue" figure, distinct from Order.totalPaise's mere existence. */
  collectedPaise: number;
  /** COD orders confirmed but not yet delivered — cash the business is owed but hasn't physically collected yet (see ConfirmCodOrderUseCase/DeliverOrderAndCapturePaymentUseCase). */
  pendingCodPaise: number;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface PaymentRepositoryPort {
  create(input: CreatePaymentInput, tx?: unknown): Promise<PaymentEntity>;
  findByOrderId(orderId: string): Promise<PaymentEntity | null>;
  findByRazorpayOrderId(razorpayOrderId: string): Promise<PaymentEntity | null>;
  update(id: string, input: UpdatePaymentInput, tx?: unknown): Promise<PaymentEntity>;
  /** The only write path to `status: "REFUNDED"` (ADR-025's split-ownership-by-transition-type — refunds' own module calls this rather than writing Payment directly). */
  markRefunded(paymentId: string, tx?: unknown): Promise<void>;
  /** Admin analytics dashboard (2026-09-03) — filtered by Payment.createdAt (this table's own timestamp), not Order.placedAt, so this stays a single-table query. */
  getCollectionSummary(range: { from: Date; to: Date }): Promise<PaymentCollectionSummary>;
}
