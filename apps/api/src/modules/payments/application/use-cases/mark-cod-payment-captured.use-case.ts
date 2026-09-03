import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

/**
 * Client-review fix (2026-09-03): a COD order's Payment row is created
 * PENDING at order-confirm time (ConfirmCodOrderUseCase) — no real cash has
 * moved yet, only cash ON delivery. This is the actual "money collected"
 * moment: the courier hands over the goods and takes payment. Composed
 * from `admin`'s delivery flow (DeliverOrderAndCapturePaymentUseCase),
 * never called from `orders` directly — `orders` cannot import `payments`
 * without recreating the payments -> orders -> payments cycle ADR-025
 * already avoids for the refund path (see CancelOrderWithRefundUseCase's
 * own doc comment for the identical reasoning).
 *
 * A no-op (not an error) for anything that isn't exactly "a COD payment
 * still PENDING" — a Razorpay order, an order with no Payment row yet, or
 * a Payment already CAPTURED (idempotent: a duplicate/retried delivery
 * confirmation must not fail or double-log anything).
 */
export class MarkCodPaymentCapturedUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  async execute(orderId: string): Promise<void> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment || payment.provider !== "COD" || payment.status !== "PENDING") {
      return;
    }
    await this.paymentRepository.update(payment.id, { status: "CAPTURED" });
  }
}
