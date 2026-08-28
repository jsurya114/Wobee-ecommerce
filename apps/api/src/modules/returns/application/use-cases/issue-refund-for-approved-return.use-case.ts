import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import { calculateReturnRefundAmount } from "../../domain/calculate-return-refund-amount";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { NotificationEnqueuerPort } from "../ports/notification-enqueuer.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { IssueRefundOutcome, RefundIssuerPort } from "../ports/refund-issuer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

export interface IssueRefundForApprovedReturnResult {
  return: ReturnEntity;
  outcome: IssueRefundOutcome;
}

/**
 * week2 (1).md §11/§12's "Refund" step — the second, separate admin action
 * after approval (see ApproveReturnUseCase's own doc comment for why these
 * are two transitions, not one). Transitions RETURN_APPROVED ->
 * REFUND_INITIATED unconditionally first (durable marker that this is now
 * in flight, mirroring how orders' own SHIPPED/DELIVERED are separate
 * committed states rather than side effects of one call), then attempts
 * the actual refund; only a successful attempt advances to REFUNDED. A
 * COD order (no gateway to call) or a gateway failure both leave the
 * return sitting at REFUND_INITIATED for MarkReturnRefundedUseCase to
 * resolve once staff confirm the money moved outside this system.
 */
export class IssueRefundForApprovedReturnUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly orderReader: OrderReaderPort,
    private readonly refundIssuer: RefundIssuerPort,
    private readonly orderReturnFlagWriter: OrderReturnFlagWriterPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly notificationEnqueuer: NotificationEnqueuerPort,
  ) {}

  async execute(returnId: string, actor: { id: string; role: Role }): Promise<IssueRefundForApprovedReturnResult> {
    const existing = await this.returnRepository.findById(returnId);
    if (!existing) {
      throw new NotFoundError("Return not found");
    }
    if (existing.status !== "RETURN_APPROVED") {
      // Idempotent-friendly for the one case that matters (already past
      // this step): re-issuing against an already-terminal REFUNDED return
      // is a no-op read, not an error — everything else really is invalid.
      if (existing.status === "REFUNDED") {
        return { return: existing, outcome: "completed" };
      }
      throw new ConflictError("This return isn't ready for a refund");
    }

    const order = await this.orderReader.forAdmin(existing.orderId);
    const amountPaise = calculateReturnRefundAmount(
      order.items.map((item) => ({ orderItemId: item.id, orderedQuantity: item.quantity, unitPricePaise: item.unitPricePaise, taxAmountPaise: item.taxAmountPaise })),
      existing.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
    );

    const transitioned = await this.returnRepository.transitionStatus(returnId, "RETURN_APPROVED", "REFUND_INITIATED");
    if (!transitioned.changed) {
      throw new ConflictError("This return isn't ready for a refund");
    }

    const { outcome } = await this.refundIssuer.issueForReturn(returnId, existing.orderId, amountPaise);
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RETURN_REFUND_ISSUED",
      entityType: "Return",
      entityId: returnId,
      metadata: { amountPaise, outcome },
    });

    if (outcome === "completed") {
      const finalized = await this.returnRepository.transitionStatus(returnId, "REFUND_INITIATED", "REFUNDED", {
        resolvedAt: new Date(),
      });
      const stillActive = await this.returnRepository.countActiveByOrderId(existing.orderId);
      if (stillActive === 0) {
        await this.orderReturnFlagWriter.setHasActiveReturn(existing.orderId, false);
      }
      await this.notificationEnqueuer.enqueue({
        userId: order.userId,
        type: "REFUND_PROCESSED",
        channel: "EMAIL",
        payload: { contactEmail: order.contactEmail, orderNumber: order.orderNumber, returnId, amountPaise },
      });
      return { return: finalized.return, outcome };
    }

    // "failed" or "not-applicable" (COD) — stays at REFUND_INITIATED,
    // needing MarkReturnRefundedUseCase once staff confirm completion.
    return { return: transitioned.return, outcome };
  }
}
