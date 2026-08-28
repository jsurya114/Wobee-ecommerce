import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

/**
 * Manual-completion path for a return stuck at REFUND_INITIATED — a COD
 * order (IssueRefundForApprovedReturnUseCase's gateway step reports
 * "not-applicable", there being no captured Razorpay payment to refund
 * through) or a Razorpay gateway failure staff have since resolved outside
 * this system (e.g. refunded manually via the Razorpay dashboard). Staff
 * confirm the money has actually moved before calling this — it does not
 * itself move any money.
 */
export class MarkReturnRefundedUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly refundIssuer: RefundIssuerPort,
    private readonly orderReturnFlagWriter: OrderReturnFlagWriterPort,
    private readonly auditLogger: AuditLoggerPort,
  ) {}

  async execute(returnId: string, actor: { id: string; role: Role }): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);
    if (!existing) {
      throw new NotFoundError("Return not found");
    }
    const result = await this.returnRepository.transitionStatus(returnId, "REFUND_INITIATED", "REFUNDED", {
      resolvedAt: new Date(),
    });
    if (!result.changed) {
      throw new ConflictError("This return isn't awaiting a manual refund completion");
    }

    await this.refundIssuer.markManuallyCompleted(returnId, result.return.orderId);

    const stillActive = await this.returnRepository.countActiveByOrderId(result.return.orderId);
    if (stillActive === 0) {
      await this.orderReturnFlagWriter.setHasActiveReturn(result.return.orderId, false);
    }
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RETURN_REFUND_MANUALLY_COMPLETED",
      entityType: "Return",
      entityId: returnId,
    });
    return result.return;
  }
}
