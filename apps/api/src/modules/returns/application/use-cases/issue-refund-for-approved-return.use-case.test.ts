import { describe, expect, it, vi } from "vitest";
import { IssueRefundForApprovedReturnUseCase } from "./issue-refund-for-approved-return.use-case";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

const actor = { id: "staff-1", role: "ORDER_PROCESSING_STAFF" as const };

function approvedReturn() {
  return {
    id: "return-1",
    orderId: "order-1",
    status: "RETURN_APPROVED",
    reason: "wrong size",
    requestedAt: new Date(),
    resolvedAt: null,
    items: [{ id: "ri-1", orderItemId: "item-1", quantity: 1, reasonDetail: null }],
  };
}

const orderForRefund = {
  id: "order-1",
  userId: "user-1",
  status: "DELIVERED",
  deliveredAt: new Date(),
  contactEmail: "a@a.com",
  orderNumber: "WOOBE-1",
  items: [{ id: "item-1", variantId: "v1", productNameSnapshot: "Scarf", quantity: 2, unitPricePaise: 1000, taxAmountPaise: 100, discountPaise: 0 }],
};

function buildUseCase(refundOutcome: "completed" | "failed" | "not-applicable" = "completed") {
  const returnRepository = {
    findById: vi.fn().mockResolvedValue(approvedReturn()),
    transitionStatus: vi
      .fn()
      .mockResolvedValueOnce({ changed: true, return: { ...approvedReturn(), status: "REFUND_INITIATED" } })
      .mockResolvedValueOnce({ changed: true, return: { ...approvedReturn(), status: "REFUNDED", resolvedAt: new Date() } }),
    countActiveByOrderId: vi.fn().mockResolvedValue(0),
  } as unknown as ReturnRepositoryPort;
  const orderReader = { forAdmin: vi.fn().mockResolvedValue(orderForRefund) } as unknown as OrderReaderPort;
  const refundIssuer = { issueForReturn: vi.fn().mockResolvedValue({ outcome: refundOutcome }) } as unknown as RefundIssuerPort;
  const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
  const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
  const notificationEnqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const useCase = new IssueRefundForApprovedReturnUseCase(returnRepository, orderReader, refundIssuer, orderReturnFlagWriter, auditLogger, notificationEnqueuer);
  return { useCase, returnRepository, orderReader, refundIssuer, orderReturnFlagWriter, auditLogger, notificationEnqueuer };
}

describe("IssueRefundForApprovedReturnUseCase", () => {
  it("computes the refund amount from the order's own items and passes it through", async () => {
    const { useCase, refundIssuer } = buildUseCase("completed");

    await useCase.execute("return-1", actor);

    // 1 unit × 1000 price + (1/2 of 100 tax) = 1050
    expect(refundIssuer.issueForReturn).toHaveBeenCalledWith("return-1", "order-1", 1050);
  });

  it("advances RETURN_APPROVED -> REFUND_INITIATED -> REFUNDED on a completed refund, clears the order's active-return flag, logs the action, and enqueues REFUND_PROCESSED", async () => {
    const { useCase, returnRepository, orderReturnFlagWriter, auditLogger, notificationEnqueuer } = buildUseCase("completed");

    const result = await useCase.execute("return-1", actor);

    expect(returnRepository.transitionStatus).toHaveBeenNthCalledWith(1, "return-1", "RETURN_APPROVED", "REFUND_INITIATED");
    expect(returnRepository.transitionStatus).toHaveBeenNthCalledWith(2, "return-1", "REFUND_INITIATED", "REFUNDED", expect.any(Object));
    expect(result.outcome).toBe("completed");
    expect(result.return.status).toBe("REFUNDED");
    expect(orderReturnFlagWriter.setHasActiveReturn).toHaveBeenCalledWith("order-1", false);
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "RETURN_REFUND_ISSUED" }));
    expect(notificationEnqueuer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REFUND_PROCESSED", payload: expect.objectContaining({ contactEmail: "a@a.com", amountPaise: 1050 }) }),
    );
  });

  it("leaves the return at REFUND_INITIATED when the gateway reports failure, does not advance further, and does not notify a refund that never completed", async () => {
    const { useCase, returnRepository, notificationEnqueuer } = buildUseCase("failed");

    const result = await useCase.execute("return-1", actor);

    expect(returnRepository.transitionStatus).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("failed");
    expect(result.return.status).toBe("REFUND_INITIATED");
    expect(notificationEnqueuer.enqueue).not.toHaveBeenCalled();
  });

  it("leaves the return at REFUND_INITIATED for a COD order (not-applicable)", async () => {
    const { useCase } = buildUseCase("not-applicable");

    const result = await useCase.execute("return-1", actor);

    expect(result.outcome).toBe("not-applicable");
    expect(result.return.status).toBe("REFUND_INITIATED");
  });

  it("throws ConflictError when the return isn't in RETURN_APPROVED", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue({ ...approvedReturn(), status: "RETURN_REQUESTED" }),
    } as unknown as ReturnRepositoryPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const refundIssuer = { issueForReturn: vi.fn() } as unknown as RefundIssuerPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new IssueRefundForApprovedReturnUseCase(returnRepository, orderReader, refundIssuer, orderReturnFlagWriter, auditLogger, notificationEnqueuer);

    await expect(useCase.execute("return-1", actor)).rejects.toThrow(/isn't ready for a refund/i);
  });

  it("is idempotent for an already-REFUNDED return — returns it as-is rather than erroring", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue({ ...approvedReturn(), status: "REFUNDED" }),
    } as unknown as ReturnRepositoryPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const refundIssuer = { issueForReturn: vi.fn() } as unknown as RefundIssuerPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new IssueRefundForApprovedReturnUseCase(returnRepository, orderReader, refundIssuer, orderReturnFlagWriter, auditLogger, notificationEnqueuer);

    const result = await useCase.execute("return-1", actor);

    expect(result.outcome).toBe("completed");
    expect(refundIssuer.issueForReturn).not.toHaveBeenCalled();
    expect(notificationEnqueuer.enqueue).not.toHaveBeenCalled();
  });
});
