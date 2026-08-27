import type { Role } from "@woobe/types";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import type { OrderEntity } from "../../../orders/domain/entities/order.entity";
import type { CancelOrderUseCase } from "../../../orders/application/use-cases/cancel-order.use-case";
import type { IssueRefundForCancelledOrderUseCase } from "../../../refunds/application/use-cases/issue-refund-for-cancelled-order.use-case";

export interface CancelOrderWithRefundResult {
  order: OrderEntity;
  refundIssued: boolean;
}

/**
 * Cancelling a paid order is three steps across three modules: the status
 * transition + stock release (`orders`), the refund (`refunds`), and the
 * `ORDER_CANCELLED` audit entry (`audit`).
 *
 * WHY THIS LIVES IN `admin` AND NOT IN `orders`: `orders` cannot import
 * `refunds`. `payments` already imports `orders` (the webhook-confirmation
 * flow calls confirmOrderUseCase / markOrderPaymentFailedUseCase), and
 * `refunds` imports `payments` (it reads/writes Payment only through
 * payments' exported use-cases). An `orders -> refunds` edge therefore
 * closes a real cycle: orders -> refunds -> payments -> orders. It happened
 * to not crash at module-evaluation time only because every cross-module
 * reference sits inside a lazy arrow closure in a port object literal —
 * fragile, and contrary to ADR-025's module-dependency-graph design, which
 * states the graph is acyclic.
 *
 * `admin` sits above all three (it is the top-level permission-gated HTTP
 * gateway and is imported by nothing but the app root), so composing them
 * here adds no edge that can lead back. That also means no new port
 * interfaces are needed: `admin` imports the concrete exported singletons
 * directly, the same pattern every other composition root uses.
 *
 * Ordering and idempotency mirror the behaviour this replaces exactly: the
 * refund is external I/O attempted only AFTER the cancellation has
 * committed, a gateway failure surfaces as `refundIssued: false` rather
 * than rolling anything back, and a `changed: false` result (a concurrent
 * cancel already won) skips both the refund and the audit write so neither
 * happens twice.
 */
export class CancelOrderWithRefundUseCase {
  constructor(
    private readonly cancelOrderUseCase: CancelOrderUseCase,
    private readonly issueRefundForCancelledOrderUseCase: IssueRefundForCancelledOrderUseCase,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, reason?: string): Promise<CancelOrderWithRefundResult> {
    const { order, changed } = await this.cancelOrderUseCase.execute(orderId, actor, reason);

    if (!changed) {
      // Already CANCELLED, or a concurrent cancel won the conditional
      // write — don't double-refund and don't write a second audit entry.
      return { order, refundIssued: false };
    }

    const { refundIssued } = await this.issueRefundForCancelledOrderUseCase.execute(orderId);

    await this.recordAuditLogUseCase.execute({
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
