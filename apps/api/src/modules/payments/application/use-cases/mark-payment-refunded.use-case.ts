import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

/**
 * The only write path to Payment.status = "REFUNDED" anywhere in the
 * codebase (ADR-025 split ownership by transition type: `payments` owns
 * every capture-lifecycle write to Payment, and is the sole implementer of
 * this one refund-lifecycle write too — `refunds` calls this rather than
 * touching Payment itself).
 */
export class MarkPaymentRefundedUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  execute(paymentId: string, tx?: unknown): Promise<void> {
    return this.paymentRepository.markRefunded(paymentId, tx);
  }
}
