import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { OrderNotificationEventType } from "./notify-order-event.use-case";

/**
 * Staff press "Out for delivery" once the courier reports the parcel is on the final-mile vehicle.
 * No status change (the order stays SHIPPED, so no enum migration): it only emails the customer, at
 * most once per order. Returns whether an email was queued so the admin UI can say "already sent".
 */
export class NotifyOutForDeliveryUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly notifyOrderEvent: { execute(orderId: string, type: OrderNotificationEventType): Promise<void> },
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundError("Order not found");
    if (order.status !== "SHIPPED") throw new ConflictError(`Only a shipped order can be marked out for delivery (status is ${order.status})`);
    await this.auditLogger.log({ actorId: actor.id, actorRole: actor.role, action: "ORDER_OUT_FOR_DELIVERY", entityType: "Order", entityId: orderId });
    await this.notifyOrderEvent.execute(orderId, "ORDER_OUT_FOR_DELIVERY");
  }
}
