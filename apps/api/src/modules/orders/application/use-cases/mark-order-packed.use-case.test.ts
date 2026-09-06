import { describe, expect, it, vi } from "vitest";
import { MarkOrderPackedUseCase } from "./mark-order-packed.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "PROCESSING",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null, hasActiveReturn: false,
    ...overrides,
  };
}

describe("MarkOrderPackedUseCase", () => {
  it("transitions PROCESSING -> PACKED and writes an audit log entry", async () => {
    const processing = order();
    const packed = order({ status: "PACKED" });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(processing),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: packed }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new MarkOrderPackedUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(result).toEqual({ changed: true, order: packed });
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith("order-1", "PROCESSING", "PACKED", "tx");
    expect(auditLogger.log).toHaveBeenCalledWith(
      { actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_PACKED", entityType: "Order", entityId: "order-1" },
      "tx",
    );
  });

  it("rejects marking packed an order that isn't PROCESSING", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "CONFIRMED" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new MarkOrderPackedUseCase(orderRepository, auditLogger, transaction);

    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot mark an order in status CONFIRMED as packed",
    );
  });

  it("is idempotent — an already-PACKED order is a no-op, not an error", async () => {
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(order({ status: "PACKED" })),
      transitionStatus: vi.fn(),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new MarkOrderPackedUseCase(orderRepository, auditLogger, transaction);

    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.changed).toBe(false);
    expect(orderRepository.transitionStatus).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("is idempotent under a concurrent race — a transition that already lost skips the audit write", async () => {
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(order()),
      transitionStatus: vi.fn().mockResolvedValue({ changed: false, order: order() }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new MarkOrderPackedUseCase(orderRepository, auditLogger, transaction);

    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.changed).toBe(false);
    expect(auditLogger.log).not.toHaveBeenCalled();
  });
});
