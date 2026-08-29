import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { ShipmentCreatorPort } from "../ports/shipment-creator.port";
import type { TransactionPort } from "../ports/transaction.port";
import type { OrderNotificationEventType } from "./notify-order-event.use-case";

export interface ShipOrderInput {
  trackingNumber: string;
  carrier: string;
}

/**
 * `PROCESSING -> SHIPPED` (architecture.md §4) — captures tracking info in
 * the same conditional write as the status change.
 *
 * Week 2 Day 5: routes the admin-entered tracking number/carrier through
 * `ShippingService.createShipment()` (shipping module, week2 (1).md §10)
 * before writing anything, rather than writing them straight to the Order
 * row as before — the real, and so far only, call site for that method
 * (see ManualShippingProvider's own doc comment for why this doesn't touch
 * a real courier API yet). Runs BEFORE the transaction: if the provider
 * rejects the input, nothing is written and the existing conditional-write
 * behavior below is completely unchanged.
 */
export class ShipOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
    private readonly shipmentCreator: ShipmentCreatorPort,
    private readonly notifyOrderEvent: { execute(orderId: string, type: OrderNotificationEventType): Promise<void> },
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, input: ShipOrderInput): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "SHIPPED") {
      return { changed: false, order: existing };
    }
    if (existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot ship an order in status ${existing.status}`);
    }

    const shipment = await this.shipmentCreator.createShipment({
      orderId,
      trackingNumber: input.trackingNumber,
      carrier: input.carrier,
    });

    const result = await this.transaction.run(async (tx) => {
      const transitioned = await this.orderRepository.transitionStatus(orderId, "PROCESSING", "SHIPPED", tx, {
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        shippedAt: new Date(),
      });
      if (transitioned.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_SHIPPED", entityType: "Order", entityId: orderId, metadata: input },
          tx,
        );
      }
      return transitioned;
    });
    if (result.changed) {
      await this.notifyOrderEvent.execute(orderId, "ORDER_SHIPPED");
    }
    return result;
  }
}
