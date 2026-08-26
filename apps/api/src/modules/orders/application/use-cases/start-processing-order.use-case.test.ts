import { describe, expect, it, vi } from "vitest";
import { StartProcessingOrderUseCase } from "./start-processing-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "CONFIRMED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

describe("StartProcessingOrderUseCase", () => {
  it("transitions CONFIRMED -> PROCESSING and writes an audit log entry", async () => {
    const confirmed = order();
    const transitioned = order({ status: "PROCESSING" });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(confirmed),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: transitioned }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(result).toEqual({ changed: true, order: transitioned });
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith("order-1", "CONFIRMED", "PROCESSING", "tx");
    expect(auditLogger.log).toHaveBeenCalledWith(
      { actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_PROCESSING_STARTED", entityType: "Order", entityId: "order-1" },
      "tx",
    );
  });

  it("rejects starting processing on an order that isn't CONFIRMED", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "PENDING_PAYMENT" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transaction);

    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot start processing an order in status PENDING_PAYMENT",
    );
  });
});
