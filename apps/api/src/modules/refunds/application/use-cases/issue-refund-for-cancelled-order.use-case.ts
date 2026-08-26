import type { PaymentReaderPort } from "../ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "../ports/payment-refund-writer.port";
import type { RazorpayRefundGatewayPort } from "../ports/razorpay-refund-gateway.port";
import type { RefundRepositoryPort } from "../ports/refund-repository.port";

export interface IssueRefundResult {
  refundIssued: boolean;
  reason?: "not-applicable" | "gateway-error";
  refundId?: string;
}

/**
 * Admin-cancellation refund path only (ADR-025) — the full customer-
 * initiated return/exchange request flow stays Week 4 scope. Decides
 * purely from the order's actual Payment record, never from the caller's
 * belief about payment method: a COD order's Payment.status is CAPTURED
 * at confirm time (see ConfirmCodOrderUseCase) even though no real money
 * has moved yet, so checking status alone is not enough — provider must
 * also be RAZORPAY.
 *
 * Never throws on a gateway failure — records a FAILED Refund row for
 * manual follow-up instead, so a broken/unconfigured Razorpay integration
 * (e.g. this repo's current stub keys) never blocks the cancellation
 * itself from completing.
 */
export class IssueRefundForCancelledOrderUseCase {
  constructor(
    private readonly paymentReader: PaymentReaderPort,
    private readonly paymentRefundWriter: PaymentRefundWriterPort,
    private readonly gateway: RazorpayRefundGatewayPort,
    private readonly refundRepository: RefundRepositoryPort,
  ) {}

  async execute(orderId: string): Promise<IssueRefundResult> {
    // Defensive idempotency (belt-and-suspenders) — the real backstop is
    // orders' own conditional status transition, which is what actually
    // prevents this method from being reached twice for the same order.
    const existing = await this.refundRepository.findByOrderId(orderId);
    if (existing) {
      return { refundIssued: existing.status === "COMPLETED", refundId: existing.id };
    }

    const payment = await this.paymentReader.findByOrderId(orderId);
    if (!payment || payment.provider !== "RAZORPAY" || payment.status !== "CAPTURED" || !payment.razorpayPaymentId) {
      return { refundIssued: false, reason: "not-applicable" };
    }

    try {
      const refund = await this.gateway.refundPayment(payment.razorpayPaymentId, payment.amountPaise);
      const created = await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "COMPLETED",
        amountPaise: payment.amountPaise,
        providerRefundId: refund.id,
      });
      await this.paymentRefundWriter.markRefunded(payment.id);
      return { refundIssued: true, refundId: created.id };
    } catch {
      await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "FAILED",
        amountPaise: payment.amountPaise,
      });
      return { refundIssued: false, reason: "gateway-error" };
    }
  }
}
