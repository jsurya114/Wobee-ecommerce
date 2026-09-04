import { ConflictError, UnauthorizedError, ValidationError } from "../../../../shared/errors";
import { WebhookEventAlreadyExistsError } from "../../domain/errors/webhook-event-already-exists.error";
import type { InventoryFinalizationPort } from "../ports/inventory-finalization.port";
import type { OrderPort } from "../ports/order-port";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";
import type { RazorpayGatewayPort } from "../ports/razorpay-gateway.port";
import type { TransactionPort } from "../ports/transaction.port";
import type { WebhookEventRepositoryPort } from "../ports/webhook-event-repository.port";

interface RazorpayPaymentEntity {
  id: string;
  order_id?: string;
  amount: number;
  status: string;
}

interface RazorpayWebhookPayload {
  event: string;
  payload?: { payment?: { entity?: RazorpayPaymentEntity } };
}

export interface WebhookOutcome {
  /** For observability only — the HTTP layer returns 200 for every one of these (Razorpay must never be told to retry a delivery we've already handled or intentionally ignored). */
  result: "deduped" | "ignored" | "amount-mismatch" | "processed" | "stale";
}

/**
 * ADR-014's authoritative payment confirmation path — the ONLY way an
 * order reaches CONFIRMED via Razorpay (never the client redirect alone,
 * DEVELOPMENT_RULES.md #3). Dedup is two-layered:
 *  1. `(provider, eventId)` unique constraint (WebhookEventRepositoryPort) —
 *     catches Razorpay literally resending the same delivery.
 *  2. `orderPort.confirm`/`markPaymentFailed`'s conditional
 *     `WHERE status = PENDING_PAYMENT` transition (`changed: false` = already
 *     done) — catches the rarer case of two different webhook deliveries
 *     both trying to move the same order, e.g. a retry racing layer 1's own
 *     dedup-row creation. Every effect below (Payment update, inventory
 *     finalize/release) only runs when `changed` is true, so processing the
 *     same outcome twice is always safe, not just usually safe.
 *
 * Week 3 Day 5 hardening: `confirm`/`markPaymentFailed` don't just return
 * `changed: false` for "already in the target state" — they THROW
 * `ConflictError` for any OTHER unexpected current status (Day 3's audit:
 * this is correct and deliberate for admin-initiated transitions, which
 * only ever fire from a known state). A webhook is different: Razorpay
 * doesn't guarantee delivery order, so a `payment.captured` can genuinely
 * arrive after a `payment.failed` already resolved the same order (or vice
 * versa) — an out-of-order/late event, not a bug in either delivery. Both
 * branches below now catch that specific `ConflictError` and return
 * `"stale"` rather than let it propagate into a non-2xx response, which
 * would tell Razorpay to retry a delivery that will *never* succeed,
 * forever. Critically, this never re-attempts the transition on a
 * different path — the order is deliberately left exactly as its earlier,
 * correctly-processed event already left it.
 */
export class HandleRazorpayWebhookUseCase {
  constructor(
    private readonly gateway: RazorpayGatewayPort,
    private readonly webhookEventRepository: WebhookEventRepositoryPort,
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly orderPort: OrderPort,
    private readonly inventoryFinalization: InventoryFinalizationPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(params: {
    rawBody: Buffer | string | undefined;
    signature: string | undefined;
    eventId: string | undefined;
    payload: RazorpayWebhookPayload;
  }): Promise<WebhookOutcome> {
    if (!params.rawBody || !params.signature || !params.eventId) {
      throw new ValidationError("Missing webhook signature or event id");
    }
    if (!this.gateway.verifyWebhookSignature(params.rawBody, params.signature)) {
      throw new UnauthorizedError("Invalid webhook signature");
    }

    let webhookEvent = await this.webhookEventRepository.findByProviderAndEventId("razorpay", params.eventId);
    if (webhookEvent?.processedAt) {
      return { result: "deduped" }; // already fully processed — the mandatory duplicate-delivery case
    }
    if (!webhookEvent) {
      try {
        webhookEvent = await this.webhookEventRepository.create("razorpay", params.eventId, params.payload.event, params.payload);
      } catch (error) {
        if (error instanceof WebhookEventAlreadyExistsError) {
          const raced = await this.webhookEventRepository.findByProviderAndEventId("razorpay", params.eventId);
          if (raced?.processedAt) return { result: "deduped" }; // the concurrent winner already finished
          webhookEvent = raced;
        } else {
          throw error;
        }
      }
    }

    const paymentEntity = params.payload.payload?.payment?.entity;
    if (!paymentEntity?.order_id) {
      if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
      return { result: "ignored" }; // an event type/shape we don't act on (e.g. a non-payment event) — still ack it
    }

    const payment = await this.paymentRepository.findByRazorpayOrderId(paymentEntity.order_id);
    const order = payment ? await this.orderPort.getOrder(payment.orderId) : null;
    if (!payment || !order) {
      if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
      return { result: "ignored" }; // no local record of this Razorpay order — nothing to reconcile
    }

    if (params.payload.event === "payment.captured") {
      if (paymentEntity.amount !== payment.amountPaise) {
        // Integrity mismatch — don't confirm on a number that doesn't match
        // what we charged for. Ack the webhook regardless (retrying won't
        // fix a data mismatch); this needs a human, not a retry storm.
        if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
        return { result: "amount-mismatch" };
      }

      let changed = false;
      try {
        ({ changed } = await this.transaction.run(async (tx) => {
          const transitioned = await this.orderPort.confirm(order.id, tx);
          if (transitioned.changed) {
            await this.paymentRepository.update(payment.id, { status: "CAPTURED", razorpayPaymentId: paymentEntity.id }, tx);
            await this.inventoryFinalization.finalize(order.items, tx);
          }
          return transitioned;
        }));
      } catch (error) {
        if (error instanceof ConflictError) {
          if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
          return { result: "stale" }; // e.g. already PAYMENT_FAILED or CANCELLED — a late/out-of-order event, ack and stop
        }
        throw error;
      }
      if (changed) {
        await this.orderPort.notifyOrderEvent(order.id, "ORDER_CONFIRMED");
      }
    } else if (params.payload.event === "payment.failed") {
      let changed = false;
      try {
        ({ changed } = await this.transaction.run(async (tx) => {
          const transitioned = await this.orderPort.markPaymentFailed(order.id, tx);
          if (transitioned.changed) {
            await this.paymentRepository.update(payment.id, { status: "FAILED" }, tx);
            await this.inventoryFinalization.release(order.items, tx);
          }
          return transitioned;
        }));
      } catch (error) {
        if (error instanceof ConflictError) {
          if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
          return { result: "stale" }; // e.g. already CONFIRMED — a late/out-of-order event, ack and stop
        }
        throw error;
      }
      if (changed) {
        await this.orderPort.notifyOrderEvent(order.id, "PAYMENT_FAILED");
      }
    }
    // Any other event type (refund.*, order.paid, ...) — deliberately out of
    // scope this week; still acknowledged below so Razorpay doesn't retry it forever.

    if (webhookEvent) await this.webhookEventRepository.markProcessed(webhookEvent.id);
    return { result: "processed" };
  }
}
