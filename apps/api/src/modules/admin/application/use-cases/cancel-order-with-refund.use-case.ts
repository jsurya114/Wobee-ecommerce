import type { Role } from "@woobe/types";
import type { CreateAuditLogInput } from "../../../audit/application/ports/audit-log-repository.port";
import type { OrderEntity } from "../../../orders/domain/entities/order.entity";
import type { TransitionOrderStatusResult } from "../../../orders/application/ports/order-repository.port";
import type { IssueRefundResult } from "../../../refunds/application/use-cases/issue-refund-for-cancelled-order.use-case";

export interface CancelOrderWithRefundResult {
  order: OrderEntity;
  refundIssued: boolean;
}

/** The one method this use-case actually calls on each collaborator — see the class doc comment for why the constructor depends on this shape rather than the concrete `CancelOrderUseCase` class. */
interface OrderCanceller {
  execute(orderId: string, actor: { id: string; role: Role }, reason?: string): Promise<TransitionOrderStatusResult>;
}

/** Matches `IssueRefundForCancelledOrderUseCase`'s own `execute` signature. */
interface CancelledOrderRefundIssuer {
  execute(orderId: string): Promise<IssueRefundResult>;
}

/** Matches `RecordAuditLogUseCase`'s own `execute` signature (its optional `tx` is never passed here — this cancellation's audit write is deliberately its own, untransacted step, same as the rest of this use-case's ordering). */
interface AuditLogger {
  execute(input: CreateAuditLogInput): Promise<void>;
}

/** Matches `EnqueueNotificationUseCase`'s own `execute` signature — see the class doc comment for why REFUND_PROCESSED for this path is enqueued here rather than inside `refunds`' own use-case. */
interface NotificationEnqueuer {
  execute(input: { userId: string | null; type: "REFUND_PROCESSED"; channel: "EMAIL"; payload: Record<string, unknown> }): Promise<void>;
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
 * here adds no edge that can lead back. The constructor depends on the
 * narrow `execute`-shaped interfaces above rather than the concrete
 * `CancelOrderUseCase`/`IssueRefundForCancelledOrderUseCase`/
 * `RecordAuditLogUseCase` classes — same DIP posture `GetCustomerDetailUseCase`
 * already uses for this same "compose in `admin`" pattern (see its own doc
 * comment). `admin.module.ts`'s wiring is unchanged either way: it still
 * passes the real exported singletons, which satisfy these interfaces
 * structurally.
 *
 * Ordering and idempotency mirror the behaviour this replaces exactly: the
 * refund is external I/O attempted only AFTER the cancellation has
 * committed, a gateway failure surfaces as `refundIssued: false` rather
 * than rolling anything back, and a `changed: false` result (a concurrent
 * cancel already won) skips both the refund and the audit write so neither
 * happens twice.
 *
 * Week 2 Day 8 (week2 (1).md §20): a successful refund here also enqueues
 * REFUND_PROCESSED — built here rather than inside `refunds`' own
 * IssueRefundForCancelledOrderUseCase because that use-case only ever sees
 * a Payment record (ADR-025), never contact PII; `admin` already has the
 * full `order` (contactEmail included) from the cancellation step above.
 */
export class CancelOrderWithRefundUseCase {
  constructor(
    private readonly cancelOrderUseCase: OrderCanceller,
    private readonly issueRefundForCancelledOrderUseCase: CancelledOrderRefundIssuer,
    private readonly recordAuditLogUseCase: AuditLogger,
    private readonly notificationEnqueuer: NotificationEnqueuer,
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

    if (refundIssued) {
      await this.notificationEnqueuer.execute({
        userId: order.userId,
        type: "REFUND_PROCESSED",
        channel: "EMAIL",
        payload: { contactEmail: order.contactEmail, orderNumber: order.orderNumber },
      });
    }

    return { order, refundIssued };
  }
}
