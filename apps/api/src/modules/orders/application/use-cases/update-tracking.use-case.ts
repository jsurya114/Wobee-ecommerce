import type { Role } from "@woobe/types";
import { resolveCourier, type CourierCode } from "@woobe/validation";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { OrderNotificationEventType } from "./notify-order-event.use-case";

export interface UpdateTrackingInput {
  trackingNumber: string;
  carrierCode?: CourierCode;
  carrier?: string;
  trackingUrl?: string;
  /** Re-email the customer the corrected shipping details. */
  resend: boolean;
}

/**
 * Staff typed the wrong courier or tracking number: rewrite them on an already-SHIPPED order and,
 * optionally, send the customer the corrected shipping email. Each re-send gets its own dedupe
 * version so it is delivered, while a double click inside the same millisecond still cannot be.
 */
export class UpdateTrackingUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly notifyOrderEvent: { execute(orderId: string, type: OrderNotificationEventType, options?: { dedupeVersion?: string }): Promise<void> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, input: UpdateTrackingInput): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) throw new NotFoundError("Order not found");
    if (existing.status !== "SHIPPED") throw new ConflictError(`Tracking can only be changed on a shipped order (status is ${existing.status})`);

    const courier = resolveCourier(input);
    const result = await this.orderRepository.updateTracking(orderId, {
      trackingNumber: input.trackingNumber.trim(),
      carrier: courier.name,
      carrierCode: courier.code,
      trackingUrl: courier.trackingUrl,
    });
    if (!result.changed) throw new ConflictError("Order is no longer shipped");

    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "ORDER_TRACKING_UPDATED",
      entityType: "Order",
      entityId: orderId,
      metadata: { from: { carrier: existing.carrier, trackingNumber: existing.trackingNumber }, to: { carrier: courier.name, trackingNumber: input.trackingNumber }, resend: input.resend },
    });
    if (input.resend) {
      await this.notifyOrderEvent.execute(orderId, "ORDER_SHIPPED", { dedupeVersion: String(this.now().getTime()) });
    }
    return result;
  }
}
