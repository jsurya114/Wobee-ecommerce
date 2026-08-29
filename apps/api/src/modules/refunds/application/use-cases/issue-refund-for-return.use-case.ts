import type { PaymentReaderPort } from "../ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "../ports/payment-refund-writer.port";
import type { RazorpayRefundGatewayPort } from "../ports/razorpay-refund-gateway.port";
import type { RefundRepositoryPort } from "../ports/refund-repository.port";

export interface IssueRefundForReturnResult {
  outcome: "completed" | "failed" | "not-applicable";
  refundId?: string;
}

/**
 * The return-driven refund path (week2 (1).md §12) — `returns`' own
 * IssueRefundForApprovedReturnUseCase calls this through RefundIssuerPort
 * after computing the exact amount for the returned lines
 * (calculateReturnRefundAmount). Idempotency is keyed by `returnId`, not
 * `orderId`: unlike cancellation (one refund per order, ever), an order
 * can have several returns over its lifetime, each needing its own
 * refund — `findByReturnId` is this path's equivalent of
 * IssueRefundForCancelledOrderUseCase's own `findByOrderId` check.
 *
 * "not-applicable" (no captured Razorpay payment — a COD order, most
 * commonly) still records an INITIATED Refund row rather than silently
 * doing nothing: unlike cancellation, a return's state machine has a
 * REFUND_INITIATED status that needs *some* Refund row to point to while
 * it waits for MarkReturnRefundedUseCase's manual-completion step.
 */
export class IssueRefundForReturnUseCase {
  constructor(
    private readonly paymentReader: PaymentReaderPort,
    private readonly paymentRefundWriter: PaymentRefundWriterPort,
    private readonly gateway: RazorpayRefundGatewayPort,
    private readonly refundRepository: RefundRepositoryPort,
  ) {}

  async issue(returnId: string, orderId: string, amountPaise: number): Promise<IssueRefundForReturnResult> {
    const existing = await this.refundRepository.findByReturnId(returnId);
    if (existing) {
      return { outcome: existing.status === "COMPLETED" ? "completed" : existing.status === "FAILED" ? "failed" : "not-applicable", refundId: existing.id };
    }

    const payment = await this.paymentReader.findByOrderId(orderId);
    if (!payment || payment.provider !== "RAZORPAY" || payment.status !== "CAPTURED" || !payment.razorpayPaymentId) {
      const created = await this.refundRepository.create({
        orderId,
        returnId,
        provider: payment?.provider ?? "COD",
        status: "INITIATED",
        amountPaise,
      });
      return { outcome: "not-applicable", refundId: created.id };
    }

    // Never refund more than was actually captured — a defensive clamp,
    // not an expected path (a return's own eligibility check already
    // caps its refund amount at the order's own item totals).
    const safeAmountPaise = Math.min(amountPaise, payment.amountPaise);

    try {
      const refund = await this.gateway.refundPayment(payment.razorpayPaymentId, safeAmountPaise);
      const created = await this.refundRepository.create({
        orderId,
        returnId,
        provider: "RAZORPAY",
        status: "COMPLETED",
        amountPaise: safeAmountPaise,
        providerRefundId: refund.id,
      });
      try {
        await this.paymentRefundWriter.markRefunded(payment.id);
      } catch {
        // Swallowed deliberately — same reasoning as IssueRefundForCancelledOrderUseCase's own comment.
      }
      return { outcome: "completed", refundId: created.id };
    } catch {
      const created = await this.refundRepository.create({
        orderId,
        returnId,
        provider: "RAZORPAY",
        status: "FAILED",
        amountPaise: safeAmountPaise,
      });
      return { outcome: "failed", refundId: created.id };
    }
  }

  async markManuallyCompleted(returnId: string, orderId: string): Promise<void> {
    await this.refundRepository.markCompletedByReturnId(returnId);
    const payment = await this.paymentReader.findByOrderId(orderId);
    if (payment) {
      try {
        await this.paymentRefundWriter.markRefunded(payment.id);
      } catch {
        // Swallowed deliberately — same reasoning as above.
      }
    }
  }
}
