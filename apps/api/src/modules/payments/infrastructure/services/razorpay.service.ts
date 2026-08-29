import Razorpay from "razorpay";
import { env } from "../../../../config/env";
import type { RazorpayGatewayPort, RazorpayOrder } from "../../application/ports/razorpay-gateway.port";

/**
 * Wraps the `razorpay` SDK — same shape as auth's BcryptService/JwtService
 * (plain class, no Prisma access; this service doesn't touch
 * Payment/WebhookEvent itself, the use-cases that call it do).
 *
 * `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` are
 * stub values until real keys are supplied (env.ts, DECISIONS_PENDING.md #4)
 * — every method fails closed with a clear error rather than silently
 * no-op'ing or (worse) treating an unconfigured webhook secret as "skip
 * verification".
 */
export class RazorpayService implements RazorpayGatewayPort {
  private readonly client: Razorpay | null;

  constructor() {
    this.client =
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
        : null;
  }

  async createOrder(input: { amountPaise: number; receipt: string }): Promise<RazorpayOrder> {
    if (!this.client) {
      throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET) — see DECISIONS_PENDING.md #4");
    }
    // amount is in paise (subunits) — matches this codebase's Int-paise convention exactly, no conversion needed.
    const order = await this.client.orders.create({ amount: input.amountPaise, currency: "INR", receipt: input.receipt });
    return { id: order.id, amountPaise: input.amountPaise, currency: "INR" };
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured — see DECISIONS_PENDING.md #4");
    }
    // HMACs the raw request body bytes against the WEBHOOK secret (distinct
    // from key_secret) — see capture-raw-body.ts for why `rawBody` has to
    // be the pre-JSON-parse bytes, not a re-serialization of req.body.
    return Razorpay.validateWebhookSignature(rawBody.toString(), signature, env.RAZORPAY_WEBHOOK_SECRET);
  }
}
