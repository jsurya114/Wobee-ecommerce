import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/**
 * `PROCESSING -> PACKED` (2026-09-06 order-processing audit) — staff-initiated
 * (ADR-024's order_processing_staff permission), same shape as
 * StartProcessingOrderUseCase exactly. Closes the audit's one confirmed gap:
 * PROCESSING alone couldn't distinguish "staff has started working the
 * order" from "staff has actually picked, verified, and packed it" — this
 * is that missing checkpoint, nothing more (no separate fulfillment model,
 * no new subsystem — one more value in the same Order.status machine).
 */
export class MarkOrderPackedUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "PACKED") {
      return { changed: false, order: existing }; // idempotent no-op
    }
    if (existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot mark an order in status ${existing.status} as packed`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "PROCESSING", "PACKED", tx);
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_PACKED", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
