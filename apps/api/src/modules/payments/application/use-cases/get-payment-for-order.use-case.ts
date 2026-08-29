import type { PaymentEntity } from "../../domain/entities/payment.entity";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

/** Thin read wrapper — lets `refunds` (and any future module) look up an order's payment without reaching into Payment directly (ADR-010). */
export class GetPaymentForOrderUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  execute(orderId: string): Promise<PaymentEntity | null> {
    return this.paymentRepository.findByOrderId(orderId);
  }
}
