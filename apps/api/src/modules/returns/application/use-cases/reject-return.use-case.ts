import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { NotificationEnqueuerPort } from "../ports/notification-enqueuer.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

/**
 * week2 (1).md §11's "Admin review -> Rejected" step — terminal, resolves
 * the return with no refund. The approved schema (`Return` model) has no
 * dedicated rejection-reason column; an optional reason is accepted here
 * purely to land in the audit log, not persisted on the Return row itself
 * — a deliberate scope call, not an oversight, since inventing a new
 * column beyond the approved status model isn't this module's call to make.
 *
 * A RETURN_REJECTED email is enqueued (async, best-effort) only when this
 * call actually performed the RETURN_REQUESTED -> RETURN_REJECTED
 * transition — never on a repeat/lost-race call.
 */
export class RejectReturnUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly orderReturnFlagWriter: OrderReturnFlagWriterPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly orderReader: OrderReaderPort,
    private readonly notificationEnqueuer: NotificationEnqueuerPort,
  ) {}

  async execute(returnId: string, actor: { id: string; role: Role }, reason?: string): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);
    if (!existing) {
      throw new NotFoundError("Return not found");
    }
    const result = await this.returnRepository.transitionStatus(returnId, "RETURN_REQUESTED", "RETURN_REJECTED", {
      resolvedAt: new Date(),
    });
    if (!result.changed) {
      throw new ConflictError("This return has already been reviewed");
    }

    const stillActive = await this.returnRepository.countActiveByOrderId(result.return.orderId);
    if (stillActive === 0) {
      await this.orderReturnFlagWriter.setHasActiveReturn(result.return.orderId, false);
    }
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RETURN_REJECTED",
      entityType: "Return",
      entityId: returnId,
      metadata: { reason },
    });

    const order = await this.orderReader.forAdmin(result.return.orderId);
    await this.notificationEnqueuer
      .enqueue({
        userId: order.userId,
        type: "RETURN_REJECTED",
        channel: "EMAIL",
        payload: { contactEmail: order.contactEmail, orderNumber: order.orderNumber, returnId, reason },
      })
      .catch(() => undefined);

    return result.return;
  }
}
