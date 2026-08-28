import { describe, expect, it, vi } from "vitest";
import { ApproveReturnUseCase } from "./approve-return.use-case";
import { RejectReturnUseCase } from "./reject-return.use-case";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

const actor = { id: "staff-1", role: "ORDER_PROCESSING_STAFF" as const };

function returnEntity(overrides: Partial<{ status: string; orderId: string }> = {}) {
  return { id: "return-1", orderId: "order-1", status: "RETURN_REQUESTED", reason: "wrong size", requestedAt: new Date(), resolvedAt: null, items: [], ...overrides };
}

function returnOrderView() {
  return { id: "order-1", userId: "user-1", status: "DELIVERED", deliveredAt: new Date(), contactEmail: "a@a.com", orderNumber: "WOOBE-1", items: [] };
}

describe("ApproveReturnUseCase", () => {
  it("transitions RETURN_REQUESTED -> RETURN_APPROVED, logs the action, and enqueues a RETURN_APPROVED notification", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue(returnEntity()),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, return: returnEntity({ status: "RETURN_APPROVED" }) }),
    } as unknown as ReturnRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn().mockResolvedValue(returnOrderView()) } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ApproveReturnUseCase(returnRepository, auditLogger, orderReader, notificationEnqueuer);

    const result = await useCase.execute("return-1", actor);

    expect(returnRepository.transitionStatus).toHaveBeenCalledWith("return-1", "RETURN_REQUESTED", "RETURN_APPROVED");
    expect(result.status).toBe("RETURN_APPROVED");
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "RETURN_APPROVED", entityId: "return-1" }));
    expect(notificationEnqueuer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RETURN_APPROVED", payload: expect.objectContaining({ contactEmail: "a@a.com" }) }),
    );
  });

  it("throws NotFoundError for an unknown return", async () => {
    const returnRepository = { findById: vi.fn().mockResolvedValue(null) } as unknown as ReturnRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new ApproveReturnUseCase(returnRepository, auditLogger, orderReader, notificationEnqueuer);

    await expect(useCase.execute("missing", actor)).rejects.toThrow("Return not found");
  });

  it("throws ConflictError when the return has already been reviewed (race or double-click)", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue(returnEntity({ status: "RETURN_APPROVED" })),
      transitionStatus: vi.fn().mockResolvedValue({ changed: false, return: returnEntity({ status: "RETURN_APPROVED" }) }),
    } as unknown as ReturnRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const orderReader = { forAdmin: vi.fn() } as unknown as OrderReaderPort;
    const notificationEnqueuer = { enqueue: vi.fn() };
    const useCase = new ApproveReturnUseCase(returnRepository, auditLogger, orderReader, notificationEnqueuer);

    await expect(useCase.execute("return-1", actor)).rejects.toThrow(/already been reviewed/i);
    expect(auditLogger.log).not.toHaveBeenCalled();
    expect(notificationEnqueuer.enqueue).not.toHaveBeenCalled();
  });
});

describe("RejectReturnUseCase", () => {
  it("transitions RETURN_REQUESTED -> RETURN_REJECTED, clears the order's active-return flag once nothing else is active, and logs the reason", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue(returnEntity()),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, return: returnEntity({ status: "RETURN_REJECTED" }) }),
      countActiveByOrderId: vi.fn().mockResolvedValue(0),
    } as unknown as ReturnRepositoryPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const useCase = new RejectReturnUseCase(returnRepository, orderReturnFlagWriter, auditLogger);

    const result = await useCase.execute("return-1", actor, "Item shows wear beyond normal use");

    expect(result.status).toBe("RETURN_REJECTED");
    expect(orderReturnFlagWriter.setHasActiveReturn).toHaveBeenCalledWith("order-1", false);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RETURN_REJECTED", metadata: { reason: "Item shows wear beyond normal use" } }),
    );
  });

  it("leaves the active-return flag alone when another return on the same order is still active", async () => {
    const returnRepository = {
      findById: vi.fn().mockResolvedValue(returnEntity()),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, return: returnEntity({ status: "RETURN_REJECTED" }) }),
      countActiveByOrderId: vi.fn().mockResolvedValue(1),
    } as unknown as ReturnRepositoryPort;
    const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const useCase = new RejectReturnUseCase(returnRepository, orderReturnFlagWriter, auditLogger);

    await useCase.execute("return-1", actor);

    expect(orderReturnFlagWriter.setHasActiveReturn).not.toHaveBeenCalled();
  });
});
