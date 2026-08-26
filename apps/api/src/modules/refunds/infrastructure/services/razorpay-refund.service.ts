import Razorpay from "razorpay";
import { env } from "../../../../config/env";
import type { RazorpayRefundGatewayPort, RazorpayRefundResult } from "../../application/ports/razorpay-refund-gateway.port";

/**
 * Independent Razorpay client for the refund-only SDK surface
 * (`client.payments.refund`) — a genuinely different operation than
 * `payments`' RazorpayService (`orders.create`/webhook verification), not
 * a duplication of the same logic. Same stub-key-guard pattern: fails
 * closed with a clear error rather than silently no-op'ing.
 */
export class RazorpayRefundService implements RazorpayRefundGatewayPort {
  private readonly client: Razorpay | null;

  constructor() {
    this.client =
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
        : null;
  }

  async refundPayment(razorpayPaymentId: string, amountPaise: number): Promise<RazorpayRefundResult> {
    if (!this.client) {
      throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET) — see DECISIONS_PENDING.md #4");
    }
    const refund = await this.client.payments.refund(razorpayPaymentId, { amount: amountPaise });
    return { id: refund.id, status: refund.status ?? "processed" };
  }
}
