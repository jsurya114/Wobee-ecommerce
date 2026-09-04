import { env } from "../../../../config/env";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import { PaymentAlreadyExistsForOrderError } from "../../domain/errors/payment-already-exists-for-order.error";
import type { OrderPort } from "../ports/order-port";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";
import type { RazorpayGatewayPort, RazorpayOrder } from "../ports/razorpay-gateway.port";

export interface RazorpayCheckoutConfig {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  orderNumber: string;
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
    if (order.paymentMethod !== "RAZORPAY") {
      throw new ConflictError("This order isn't set up for Razorpay payment");
    }
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
        amountPaise: existingPayment.amountPaise,
        currency: "INR",
        orderNumber: order.orderNumber,
        keyId: env.RAZORPAY_KEY_ID,
      };
    }

    const razorpayOrder: RazorpayOrder = await this.gateway.createOrder({
      amountPaise: order.totalPaise,
      receipt: order.orderNumber,
    });

    try {
      await this.paymentRepository.create({
        orderId: order.id,
        provider: "RAZORPAY",
        status: "CREATED",
        amountPaise: order.totalPaise,
        razorpayOrderId: razorpayOrder.id,
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
            amountPaise: winner.amountPaise,
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
      amountPaise: order.totalPaise,
      currency: "INR",
      orderNumber: order.orderNumber,
      keyId: env.RAZORPAY_KEY_ID,
    };
  }
}
