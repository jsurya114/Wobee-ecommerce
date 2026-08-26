import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/** `SHIPPED -> DELIVERED` (architecture.md §4) — end of the happy-path lifecycle. */
export class DeliverOrderUseCase {
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
    if (existing.status === "DELIVERED") {
      return { changed: false, order: existing };
    }
    if (existing.status !== "SHIPPED") {
      throw new ConflictError(`Cannot deliver an order in status ${existing.status}`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "SHIPPED", "DELIVERED", tx, { deliveredAt: new Date() });
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_DELIVERED", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
