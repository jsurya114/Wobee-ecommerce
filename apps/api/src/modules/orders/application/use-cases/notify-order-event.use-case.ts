import type { OrderEntity } from "../../domain/entities/order.entity";
import type { NotificationEnqueuerPort, OrderNotificationEventType } from "../ports/notification-enqueuer.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

export type { OrderNotificationEventType };

/**
 * The one place that builds an order-lifecycle notification payload (Week
 * 2 Day 8; enriched 2026-09-10 for the transactional-email system) —
 * `orders` owns the customer's contact PII and the full order snapshot, so
 * this stays here rather than in `payments`, whose own OrderPort
 * deliberately narrows what it exposes (see GetOrderForPaymentUseCase's
 * doc comment). `payments` calls this indirectly, passing only an orderId
 * and the event type, never any PII of its own.
 *
 * Called AFTER the caller's own transaction has committed (ShipOrderUseCase/
 * DeliverOrderUseCase call this once `transaction.run` resolves;
 * payments.module.ts's OrderPort.notifyOrderEvent adapter is called the
 * same way, post-commit). No transaction awareness of its own — it always
 * re-reads the order fresh.
 *
 * Silently no-ops rather than throwing if the order can't be found — a
 * failure here must never surface as a failure of the state transition
 * that already committed; this is a best-effort side effect.
 *
 * The ORDER_CONFIRMED payload is the itemised invoice/receipt: every paise
 * figure comes straight from the authoritative order snapshot (no
 * calculation here), plus the derived payment status.
 */
export class NotifyOrderEventUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly notificationEnqueuer: NotificationEnqueuerPort,
  ) {}

  async execute(orderId: string, type: OrderNotificationEventType): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;

    await this.notificationEnqueuer.enqueue({
      userId: order.userId,
      type,
      channel: "EMAIL",
      payload: this.buildPayload(order, type),
    });
  }

  private buildPayload(order: OrderEntity, type: OrderNotificationEventType): Record<string, unknown> {
    const base = {
      contactEmail: order.contactEmail,
      contactName: order.contactName,
      orderNumber: order.orderNumber,
      totalPaise: order.totalPaise,
    };

    if (type === "ORDER_CONFIRMED") {
      return {
        ...base,
        paymentMethod: order.paymentMethod,
        // At ORDER_CONFIRMED a RAZORPAY order has necessarily had its
        // payment captured (the webhook is the only path to CONFIRMED for
        // it); a COD order is confirmed with payment still due on delivery.
        paymentStatus: order.paymentMethod === "COD" ? "PAY_ON_DELIVERY" : "PAID",
        placedAt: order.placedAt.toISOString(),
        items: order.items.map((item) => ({
          name: item.productNameSnapshot,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
          unitPricePaise: item.unitPricePaise,
          lineTotalPaise: item.lineTotalPaise,
        })),
        subtotalPaise: order.subtotalPaise,
        discountPaise: order.discountPaise,
        shippingFeePaise: order.shippingFeePaise,
        taxPaise: order.taxPaise,
        shippingAddress: {
          fullName: order.shippingSnapshot.fullName,
          phone: order.shippingSnapshot.phone,
          line1: order.shippingSnapshot.line1,
          line2: order.shippingSnapshot.line2,
          city: order.shippingSnapshot.city,
          state: order.shippingSnapshot.state,
          pincode: order.shippingSnapshot.pincode,
        },
      };
    }

    if (type === "ORDER_SHIPPED") {
      return { ...base, trackingNumber: order.trackingNumber, carrier: order.carrier };
    }

    // PAYMENT_FAILED, ORDER_DELIVERED — the base fields are all the template needs.
    return base;
  }
}
