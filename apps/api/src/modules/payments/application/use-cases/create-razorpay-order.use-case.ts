import { env } from "../../../../config/env";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import { PaymentAlreadyExistsForOrderError } from "../../domain/errors/payment-already-exists-for-order.error";
import type { OrderForPayment, OrderPort } from "../ports/order-port";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";
import type { RazorpayGatewayPort, RazorpayOrder } from "../ports/razorpay-gateway.port";

export interface RazorpayCheckoutConfig {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  orderNumber: string;
  /** What `amountPaise` pays for (2026-09-28): the whole order, or only a COD order's delivery fee (the rest is cash on delivery). */
  purpose: "ORDER_TOTAL" | "DELIVERY_FEE";
  /** `key_id` is meant to be public — embedded directly in the client-side Checkout widget, unlike `key_secret`. Reading `env` directly here matches auth's issue-token-pair.ts precedent for non-secret operational config. */
  keyId: string;
}

/**
 * ADR-014's Orders API integration — creates the Razorpay-side order the
 * client's Razorpay Checkout widget needs (order_id, amount, key). Does
 * NOT confirm anything: `Order.status` stays `PENDING_PAYMENT` until the
 * webhook (HandleRazorpayWebhookUseCase) verifies an actual capture.
 *
 * Week 3 Day 4 hardening: the pre-check below (`findByOrderId` then
 * `create`) is NOT itself atomic — two concurrent calls for the same order
 * (a double-click on "Pay Now" before the button disables) could both see
 * no existing payment and both call the REAL Razorpay API, unlike COD's
 * sibling `ConfirmCodOrderUseCase`, which serializes on the order's own
 * atomic status transition. Razorpay's flow has no such transition to hook
 * (the order stays `PENDING_PAYMENT` until the webhook fires), so the race
 * is closed with `Payment.orderId`'s new `@@unique` constraint instead: the
 * LOSER's `create()` throws `PaymentAlreadyExistsForOrderError`, caught
 * below to defer to whichever request's write actually landed. The
 * loser's own already-completed `gateway.createOrder()` call is simply
 * discarded — wasteful in the rare race case (an extra real Razorpay API
 * call, an unused order on Razorpay's side) but harmless: nothing in this
 * system, or the customer's browser, ever sees or depends on it.
 */
/**
 * What this order pays online, decided purely from the order's own server-side
 * snapshot (never a client value): a RAZORPAY order pays its full total; a COD
 * order pays ONLY its delivery fee, and only when checkout recorded that it
 * must (payableOnDeliveryPaise set — COD shipping upfront, 2026-09-28). The
 * COD Payment row keeps `amountPaise` = the order total (so the existing
 * "collect cash at delivery" and analytics paths are unchanged) and records
 * the online part separately in `upfrontAmountPaise`.
 */
function resolveOnlineCharge(order: OrderForPayment): { provider: "RAZORPAY" | "COD"; chargePaise: number; purpose: RazorpayCheckoutConfig["purpose"] } {
  if (order.paymentMethod === "RAZORPAY") {
    return { provider: "RAZORPAY", chargePaise: order.totalPaise, purpose: "ORDER_TOTAL" };
  }
  if (order.payableOnDeliveryPaise !== null && order.shippingFeePaise > 0) {
    return { provider: "COD", chargePaise: order.shippingFeePaise, purpose: "DELIVERY_FEE" };
  }
  throw new ConflictError("This order isn't set up for online payment");
}

export class CreateRazorpayOrderUseCase {
  constructor(
    private readonly orderPort: OrderPort,
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly gateway: RazorpayGatewayPort,
  ) {}

  async execute(orderId: string, requesterUserId: string | undefined): Promise<RazorpayCheckoutConfig> {
    const order = await this.orderPort.getOrder(orderId);
    if (!order || (order.userId && order.userId !== requesterUserId)) {
      throw new NotFoundError("Order not found"); // same "don't reveal ownership" posture as GetOrderUseCase
    }
    const charge = resolveOnlineCharge(order);
    if (order.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`Cannot start payment for an order in status ${order.status}`);
    }
    if (!env.RAZORPAY_KEY_ID) {
      throw new Error("RAZORPAY_KEY_ID is not configured — see DECISIONS_PENDING.md #4");
    }

    // Idempotent: a page refresh / double-click re-hitting this endpoint
    // reuses the already-created Razorpay order instead of creating a
    // second one for the same Order row.
    const existingPayment = await this.paymentRepository.findByOrderId(order.id);
    if (existingPayment?.razorpayOrderId) {
      return {
        razorpayOrderId: existingPayment.razorpayOrderId,
        amountPaise: existingPayment.upfrontAmountPaise ?? existingPayment.amountPaise,
        purpose: charge.purpose,
        currency: "INR",
        orderNumber: order.orderNumber,
        keyId: env.RAZORPAY_KEY_ID,
      };
    }

    const razorpayOrder: RazorpayOrder = await this.gateway.createOrder({
      amountPaise: charge.chargePaise,
      receipt: order.orderNumber,
    });

    try {
      await this.paymentRepository.create({
        orderId: order.id,
        provider: charge.provider,
        status: "CREATED",
        amountPaise: order.totalPaise,
        razorpayOrderId: razorpayOrder.id,
        ...(charge.provider === "COD" ? { upfrontAmountPaise: charge.chargePaise } : {}),
      });
    } catch (error) {
      if (error instanceof PaymentAlreadyExistsForOrderError) {
        // Lost the race — another concurrent call's create() landed first.
        // Defer to it: same "return the already-created result" idempotent
        // response the pre-check above gives on a normal (non-racing) retry.
        const winner = await this.paymentRepository.findByOrderId(order.id);
        if (winner?.razorpayOrderId) {
          return {
            razorpayOrderId: winner.razorpayOrderId,
            amountPaise: winner.upfrontAmountPaise ?? winner.amountPaise,
            purpose: charge.purpose,
            currency: "INR",
            orderNumber: order.orderNumber,
            keyId: env.RAZORPAY_KEY_ID,
          };
        }
        // Shouldn't happen (the constraint only fires once a row with a
        // razorpayOrderId already committed) — fail deterministically
        // rather than return a made-up result.
        throw new ConflictError("Payment setup for this order is already in progress — please try again");
      }
      throw error;
    }

    return {
      razorpayOrderId: razorpayOrder.id,
      amountPaise: charge.chargePaise,
      purpose: charge.purpose,
      currency: "INR",
      orderNumber: order.orderNumber,
      keyId: env.RAZORPAY_KEY_ID,
    };
  }
}
