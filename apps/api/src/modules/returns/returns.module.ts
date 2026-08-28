// Composition root for the returns module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): Return, ReturnItem.
//
// week2 (1).md §27's own execution order schedules Module 9 (Returns) +
// Module 10 (Refunds) as Week 2 Day 6 — this build-out supersedes the
// stale "Built out: Week 4" comment the Week 1 placeholder for this file
// carried (see refunds.module.ts's own updated comment for the same
// correction on that side).
//
// No cross-module import cycle here despite depending on BOTH `orders`
// and `refunds`: nothing imports `returns` back (unlike orders/refunds/
// payments' own three-way cycle risk, which is why admin composes
// CancelOrderWithRefundUseCase instead of orders doing it directly) — see
// apps/api/.dependency-cruiser.cjs's `no-circular` rule, which this
// module's own boundaries:check run verifies.
import { recordAuditLogUseCase } from "../audit/audit.module";
import { getOrderForAdminUseCase, getOrderUseCase, setOrderHasActiveReturnUseCase } from "../orders/orders.module";
import { issueRefundForReturnUseCase } from "../refunds/refunds.module";
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import type { OrderReaderPort, ReturnOrderView } from "./application/ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "./application/ports/order-return-flag-writer.port";
import type { RefundIssuerPort } from "./application/ports/refund-issuer.port";
import { ApproveReturnUseCase } from "./application/use-cases/approve-return.use-case";
import { GetReturnForAdminUseCase } from "./application/use-cases/get-return-for-admin.use-case";
import { GetReturnUseCase } from "./application/use-cases/get-return.use-case";
import { IssueRefundForApprovedReturnUseCase } from "./application/use-cases/issue-refund-for-approved-return.use-case";
import { ListMyReturnsUseCase } from "./application/use-cases/list-my-returns.use-case";
import { ListReturnsForAdminUseCase } from "./application/use-cases/list-returns-for-admin.use-case";
import { MarkReturnRefundedUseCase } from "./application/use-cases/mark-return-refunded.use-case";
import { RejectReturnUseCase } from "./application/use-cases/reject-return.use-case";
import { RequestReturnUseCase } from "./application/use-cases/request-return.use-case";
import { ReturnRepository } from "./infrastructure/repositories/return.repository";
import { ReturnsController } from "./interface/http/returns.controller";
import { createReturnsRouter } from "./interface/http/returns.routes";

const returnRepository = new ReturnRepository();

function toReturnOrderView(order: {
  id: string;
  userId: string | null;
  status: string;
  deliveredAt: Date | null;
  items: { id: string; variantId: string; productNameSnapshot: string; quantity: number; unitPricePaise: number; taxAmountPaise: number }[];
}): ReturnOrderView {
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    deliveredAt: order.deliveredAt,
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      taxAmountPaise: item.taxAmountPaise,
    })),
  };
}

const orderReader: OrderReaderPort = {
  forCustomer: async (orderId, userId) => toReturnOrderView(await getOrderUseCase.execute(orderId, userId)),
  forAdmin: async (orderId) => toReturnOrderView(await getOrderForAdminUseCase.execute(orderId)),
};
const orderReturnFlagWriter: OrderReturnFlagWriterPort = {
  setHasActiveReturn: (orderId, value) => setOrderHasActiveReturnUseCase.execute(orderId, value),
};
const refundIssuer: RefundIssuerPort = {
  issueForReturn: (returnId, orderId, amountPaise) => issueRefundForReturnUseCase.issue(returnId, orderId, amountPaise),
  markManuallyCompleted: (returnId, orderId) => issueRefundForReturnUseCase.markManuallyCompleted(returnId, orderId),
};
const auditLogger: AuditLoggerPort = { log: (entry) => recordAuditLogUseCase.execute(entry) };

const requestReturnUseCase = new RequestReturnUseCase(orderReader, returnRepository, orderReturnFlagWriter);
const listMyReturnsUseCase = new ListMyReturnsUseCase(returnRepository);
const getReturnUseCase = new GetReturnUseCase(returnRepository, orderReader);

/** Exported for `admin`'s HTTP layer (ADR-025) — same pattern orders'/reviews' own admin-facing exports use. */
export const listReturnsForAdminUseCase = new ListReturnsForAdminUseCase(returnRepository);
export const getReturnForAdminUseCase = new GetReturnForAdminUseCase(returnRepository, orderReader);
export const approveReturnUseCase = new ApproveReturnUseCase(returnRepository, auditLogger);
export const rejectReturnUseCase = new RejectReturnUseCase(returnRepository, orderReturnFlagWriter, auditLogger);
export const issueRefundForApprovedReturnUseCase = new IssueRefundForApprovedReturnUseCase(
  returnRepository,
  orderReader,
  refundIssuer,
  orderReturnFlagWriter,
  auditLogger,
);
export const markReturnRefundedUseCase = new MarkReturnRefundedUseCase(returnRepository, refundIssuer, orderReturnFlagWriter, auditLogger);

const returnsController = new ReturnsController(requestReturnUseCase, listMyReturnsUseCase, getReturnUseCase);

export const router = createReturnsRouter(returnsController);
