import type { RefundEntity } from "../../domain/entities/refund.entity";
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
 * belief about payment method: `provider` must be RAZORPAY, full stop — a
 * COD order is never refunded through this gateway path (there is no
 * gateway to reverse; cancellation always happens before delivery anyway —
 * see CancelOrderUseCase — so a cancelled COD order's Payment is still
 * PENDING, no cash was ever collected to refund). Checking `provider`
 * rather than deriving this from `status` keeps this correct even now that
 * a delivered COD order's Payment does legitimately reach CAPTURED (see
 * ConfirmCodOrderUseCase / DeliverOrderAndCapturePaymentUseCase) —
 * `status === "CAPTURED"` alone was never a safe proxy for "refundable via
 * Razorpay," and still isn't.
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

    let created: RefundEntity;
    try {
      const refund = await this.gateway.refundPayment(payment.razorpayPaymentId, payment.amountPaise);
      created = await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "COMPLETED",
        amountPaise: payment.amountPaise,
        providerRefundId: refund.id,
      });
    } catch {
      // Only the gateway call and the COMPLETED-row write land here: a
      // failure at either point means no refund actually happened (or we
      // can't prove one did), so recording a FAILED row is accurate.
      await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "FAILED",
        amountPaise: payment.amountPaise,
      });
      return { refundIssued: false, reason: "gateway-error" };
    }

    // The refund has genuinely happened and is durably recorded as
    // COMPLETED above — nothing past this point may relabel it as failed
    // or write a second Refund row. markRefunded is a separate,
    // best-effort bookkeeping step on the Payment side: if it throws (e.g.
    // a transient DB error), that's a narrower, separately recoverable
    // problem than misreporting a successful refund as failed, so it must
    // not affect the result we return here.
    try {
      await this.paymentRefundWriter.markRefunded(payment.id);
    } catch {
      // Swallowed deliberately — see comment above. The Payment row may be
      // left stale (not marked REFUNDED), which is an acceptable, narrower
      // gap versus a duplicate FAILED Refund row shadowing this COMPLETED one.
    }
    return { refundIssued: true, refundId: created.id };
  }
}
