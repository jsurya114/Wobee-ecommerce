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

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface PaymentRepositoryPort {
  create(input: CreatePaymentInput, tx?: unknown): Promise<PaymentEntity>;
  findByOrderId(orderId: string): Promise<PaymentEntity | null>;
  findByRazorpayOrderId(razorpayOrderId: string): Promise<PaymentEntity | null>;
  update(id: string, input: UpdatePaymentInput, tx: unknown): Promise<PaymentEntity>;
  /** The only write path to `status: "REFUNDED"` (ADR-025's split-ownership-by-transition-type — refunds' own module calls this rather than writing Payment directly). */
  markRefunded(paymentId: string, tx?: unknown): Promise<void>;
}
