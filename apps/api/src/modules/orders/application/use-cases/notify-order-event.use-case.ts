import type { NotificationEnqueuerPort, OrderNotificationEventType } from "../ports/notification-enqueuer.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

export type { OrderNotificationEventType };

/**
 * The one place that builds an order-lifecycle notification payload (Week
 * 2 Day 8, week2 (1).md §20) — `orders` is what actually owns the
 * customer's contactEmail, so this stays here rather than in `payments`,
 * whose own OrderPort deliberately narrows what it exposes to exclude
 * contact PII (see GetOrderForPaymentUseCase's own doc comment) —
 * `payments` calls this indirectly, passing only an orderId and the event
 * type, never any PII of its own.
 *
 * Called AFTER the caller's own transaction has committed (ShipOrderUseCase/
 * DeliverOrderUseCase call this themselves once `transaction.run` resolves;
 * payments.module.ts's OrderPort.notifyOrderEvent adapter is called the
 * same way, post-commit, from ConfirmCodOrderUseCase/
 * HandleRazorpayWebhookUseCase) — this use-case has no transaction
 * awareness of its own, deliberately: it always re-reads the order fresh.
 *
 * Silently no-ops rather than throwing if the order can't be found — a
 * failure here must never surface as a failure of the state transition
 * that already committed; this is a best-effort side effect, not part of
 * the order lifecycle's own correctness.
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
      payload: {
        contactEmail: order.contactEmail,
        orderNumber: order.orderNumber,
        totalPaise: order.totalPaise,
        ...(type === "ORDER_SHIPPED" ? { trackingNumber: order.trackingNumber, carrier: order.carrier } : {}),
      },
    });
  }
}
