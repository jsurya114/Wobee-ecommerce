import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { InventoryRestockPort } from "../ports/inventory-restock.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/**
 * `SHIPPED -> RETURNED_TO_ORIGIN` (2026-09-06 order-processing audit,
 * finding I-1) — a courier-refused or otherwise undeliverable parcel coming
 * back to Woobe's own warehouse. Before this, SHIPPED had no valid path
 * forward except DELIVERED: a refused COD parcel left staff with no correct
 * action (force it through DELIVERED — wrongly capturing money that was
 * never collected — or leave the order and its deducted stock stuck forever).
 *
 * Self-contained (own transaction, own audit write) rather than composed one
 * level up in `admin` the way CancelOrderWithRefundUseCase is: cancellation
 * needs `admin` to compose it with `refunds` (an orders -> refunds edge would
 * close a real cycle, see that use-case's own doc comment) — RTO never
 * touches Payment or Refund at all, so there's no cross-module edge to avoid.
 *
 * Deliberately does NOT touch Payment: a COD parcel the courier never
 * delivered was never paid for (Payment stays exactly where
 * ConfirmCodOrderUseCase left it — PENDING); a prepaid/online order's
 * captured payment is left untouched too — a refund for an undelivered
 * prepaid order is a separate, explicit admin decision (issued the same way
 * a cancellation refund is), not an automatic side effect of recording that
 * delivery failed.
 *
 * Inventory is restocked through the exact same InventoryRestockPort
 * `CancelOrderUseCase` already uses (`restockFinalizedSaleUseCase` — puts
 * the stock back into `quantityAvailable`, since by SHIPPED the sale was
 * already finalized/deducted) — same port, no new inventory subsystem.
 */
export class MarkOrderReturnedToOriginUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly inventoryRestock: InventoryRestockPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "RETURNED_TO_ORIGIN") {
      return { changed: false, order: existing }; // idempotent no-op — repeated RTO attempts must not restock twice
    }
    if (existing.status !== "SHIPPED") {
      throw new ConflictError(`Cannot mark an order in status ${existing.status} as returned to origin`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "SHIPPED", "RETURNED_TO_ORIGIN", tx);
      if (result.changed) {
        await this.inventoryRestock.restock(
          result.order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          tx,
        );
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_RETURNED_TO_ORIGIN", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
