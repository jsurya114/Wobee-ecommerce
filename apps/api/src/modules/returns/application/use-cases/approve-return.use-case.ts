import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { NotificationEnqueuerPort } from "../ports/notification-enqueuer.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

/** week2 (1).md §11's "Admin review -> Approved" step. Does NOT issue a refund — plan.md §4's own state machine keeps RETURN_APPROVED and REFUND_INITIATED as separate transitions (the workflow's own "Pickup/receipt where applicable" sits between them), see IssueRefundForApprovedReturnUseCase for the next step. */
export class ApproveReturnUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly orderReader: OrderReaderPort,
    private readonly notificationEnqueuer: NotificationEnqueuerPort,
  ) {}

  async execute(returnId: string, actor: { id: string; role: Role }): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);
    if (!existing) {
      throw new NotFoundError("Return not found");
    }
    const result = await this.returnRepository.transitionStatus(returnId, "RETURN_REQUESTED", "RETURN_APPROVED");
    if (!result.changed) {
      throw new ConflictError("This return has already been reviewed");
    }
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RETURN_APPROVED",
      entityType: "Return",
      entityId: returnId,
    });

    const order = await this.orderReader.forAdmin(result.return.orderId);
    await this.notificationEnqueuer.enqueue({
      userId: order.userId,
      type: "RETURN_APPROVED",
      channel: "EMAIL",
      payload: { contactEmail: order.contactEmail, orderNumber: order.orderNumber, returnId },
    });

    return result.return;
  }
}
