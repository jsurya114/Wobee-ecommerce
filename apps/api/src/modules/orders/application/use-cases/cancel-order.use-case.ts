import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { InventoryReleasePort } from "../ports/inventory-release.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { TransactionPort } from "../ports/transaction.port";

export interface CancelOrderResult {
  order: OrderEntity;
  refundIssued: boolean;
}

/**
 * `CONFIRMED`/`PROCESSING` -> `CANCELLED` (architecture.md §4's
 * pre-shipment-only cancellation). `CONFIRMED` means a payment was already
 * webhook-verified and captured (ADR-014) or a COD accounting entry was
 * recorded — cancelling without repaying would leave the customer having
 * paid for a cancelled order, so this always attempts a refund (ADR-025),
 * never just releases inventory.
 *
 * The refund call is external I/O and deliberately happens OUTSIDE the DB
 * transaction (after it commits) — the order is CANCELLED and its stock
 * released atomically first, then the refund is attempted. A refund
 * gateway failure never blocks or rolls back the cancellation itself; it
 * shows up as `refundIssued: false` for the caller to surface honestly
 * (e.g. "cancelled — refund needs manual follow-up").
 */
export class CancelOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly inventoryRelease: InventoryReleasePort,
    private readonly refundIssuer: RefundIssuerPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, reason?: string): Promise<CancelOrderResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "CANCELLED") {
      return { order: existing, refundIssued: false }; // idempotent no-op
    }
    if (existing.status !== "CONFIRMED" && existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot cancel an order in status ${existing.status}`);
    }
    const fromStatus = existing.status;

    const { changed, order } = await this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, fromStatus, "CANCELLED", tx, {
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      });
      if (result.changed) {
        await this.inventoryRelease.release(
          result.order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          tx,
        );
      }
      return result;
    });

    if (!changed) {
      return { order, refundIssued: false }; // a concurrent cancel already won — don't double-release or double-refund
    }

    const { refundIssued } = await this.refundIssuer.issueRefundIfNeeded(orderId);

    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: orderId,
      metadata: { reason, refundIssued },
    });

    return { order, refundIssued };
  }
}
