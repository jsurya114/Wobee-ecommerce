import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/** `CONFIRMED -> PROCESSING` (architecture.md §4's order state machine) — staff-initiated (ADR-024's order_processing_staff permission). */
export class StartProcessingOrderUseCase {
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
    if (existing.status === "PROCESSING") {
      return { changed: false, order: existing }; // idempotent no-op
    }
    if (existing.status !== "CONFIRMED") {
      throw new ConflictError(`Cannot start processing an order in status ${existing.status}`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "CONFIRMED", "PROCESSING", tx);
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_PROCESSING_STARTED", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
