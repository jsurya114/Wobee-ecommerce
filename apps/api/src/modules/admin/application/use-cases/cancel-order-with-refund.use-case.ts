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

/** Matches `EnqueueNotificationUseCase`'s own `execute` signature — see the class doc comment for why the cancellation/refund emails for this path are enqueued here rather than inside `refunds`' own use-case. */
interface NotificationEnqueuer {
  execute(input: {
    userId: string | null;
    type: "ORDER_CANCELLED" | "REFUND_COMPLETED";
    channel: "EMAIL";
    payload: Record<string, unknown>;
  }): Promise<void>;
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
 * Week 2 Day 8 (week2 (1).md §20) / 2026-09-10 transactional-email build:
 * on a successful cancel this enqueues a distinct ORDER_CANCELLED email
 * (NOT a refund email — the two are semantically separate), and, only when
 * a refund genuinely completed here (`IssueRefundForCancelledOrderUseCase`
 * returns `refundIssued: true` solely for a synchronously-COMPLETED Razorpay
 * refund), a REFUND_COMPLETED email as well. Built here rather than inside
 * `refunds`' own use-case because that use-case only ever sees a Payment
 * record (ADR-025), never contact PII; `admin` already has the full `order`
 * (contactEmail included) from the cancellation step above.
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

    // Distinct cancellation email — always, on a genuine cancel. Never
    // conflated with the refund email.
    await this.notificationEnqueuer.execute({
      userId: order.userId,
      type: "ORDER_CANCELLED",
      channel: "EMAIL",
      payload: {
        contactEmail: order.contactEmail,
        contactName: order.contactName,
        orderNumber: order.orderNumber,
        refundIssued,
        cancellationReason: reason,
      },
    });

    // Separate refund email — only when a refund actually completed here
    // (synchronous Razorpay refund). A COD/unpaid cancel issues no refund
    // and sends no refund email.
    if (refundIssued) {
      await this.notificationEnqueuer.execute({
        userId: order.userId,
        type: "REFUND_COMPLETED",
        channel: "EMAIL",
        payload: {
          contactEmail: order.contactEmail,
          orderNumber: order.orderNumber,
          amountPaise: order.totalPaise,
        },
      });
    }

    return { order, refundIssued };
  }
}
