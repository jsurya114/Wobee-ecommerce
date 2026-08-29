import { describe, expect, it, vi } from "vitest";
import { MarkReturnRefundedUseCase } from "./mark-return-refunded.use-case";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

const actor = { id: "staff-1", role: "ORDER_PROCESSING_STAFF" as const };

function refundInitiatedReturn() {
  return { id: "return-1", orderId: "order-1", status: "REFUND_INITIATED", reason: "wrong size", requestedAt: new Date(), resolvedAt: null, items: [] };
}

function returnOrderView() {
  return { id: "order-1", userId: "user-1", status: "DELIVERED", deliveredAt: new Date(), contactEmail: "a@a.com", orderNumber: "WOOBE-1", items: [] };
}

describe("MarkReturnRefundedUseCase", () => {
  it("transitions REFUND_INITIATED -> REFUNDED, marks the refund manually completed, clears the active-return flag, logs the action, and enqueues REFUND_PROCESSED", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue(refundInitiatedReturn()),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, return: { ...refundInitiatedReturn(), status: "REFUNDED" } }),
      countActiveByOrderId: vi.fn().mockResolvedValue(0),
    } as unknown as ReturnRepositoryPort;
    const refundIssuer = { markManuallyCompleted: vi.fn() } as unknown as RefundIssuerPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn().mockResolvedValue(returnOrderView()) } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const useCase = new MarkReturnRefundedUseCase(returnRepository, refundIssuer, orderReturnFlagWriter, auditLogger, orderReader, notificationEnqueuer);

    const result = await useCase.execute("return-1", actor);

    expect(result.status).toBe("REFUNDED");
    expect(refundIssuer.markManuallyCompleted).toHaveBeenCalledWith("return-1", "order-1");
    expect(orderReturnFlagWriter.setHasActiveReturn).toHaveBeenCalledWith("order-1", false);
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "RETURN_REFUND_MANUALLY_COMPLETED" }));
    expect(notificationEnqueuer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REFUND_PROCESSED", payload: expect.objectContaining({ contactEmail: "a@a.com" }) }),
    );
  });

  it("throws ConflictError when the return isn't awaiting manual completion", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue({ ...refundInitiatedReturn(), status: "RETURN_APPROVED" }),
      transitionStatus: vi.fn().mockResolvedValue({ changed: false, return: refundInitiatedReturn() }),
    } as unknown as ReturnRepositoryPort;
    const refundIssuer = { markManuallyCompleted: vi.fn() } as unknown as RefundIssuerPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new MarkReturnRefundedUseCase(returnRepository, refundIssuer, orderReturnFlagWriter, auditLogger, orderReader, notificationEnqueuer);

    await expect(useCase.execute("return-1", actor)).rejects.toThrow(/awaiting a manual refund completion/i);
    expect(refundIssuer.markManuallyCompleted).not.toHaveBeenCalled();
    expect(notificationEnqueuer.enqueue).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for an unknown return", async () => {
    const returnRepository = { findById: vi.fn().mockResolvedValue(null) } as unknown as ReturnRepositoryPort;
    const refundIssuer = { markManuallyCompleted: vi.fn() } as unknown as RefundIssuerPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new MarkReturnRefundedUseCase(returnRepository, refundIssuer, orderReturnFlagWriter, auditLogger, orderReader, notificationEnqueuer);

    await expect(useCase.execute("missing", actor)).rejects.toThrow("Return not found");
  });
});
