import type { PaymentCollectionSummary, PaymentRepositoryPort } from "../ports/payment-repository.port";

/** Admin analytics dashboard (2026-09-03) — exported for `admin`'s GetAdminDashboardUseCase (ADR-025: `admin` composes, never touches Prisma of its own). */
export class GetPaymentCollectionSummaryUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  execute(range: { from: Date; to: Date }): Promise<PaymentCollectionSummary> {
    return this.paymentRepository.getCollectionSummary(range);
  }
}
