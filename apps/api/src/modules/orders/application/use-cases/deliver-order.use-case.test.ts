import { describe, expect, it, vi } from "vitest";
import { DeliverOrderUseCase } from "./deliver-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "SHIPPED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: new Date(), deliveredAt: null, cancelledAt: null, cancellationReason: null, hasActiveReturn: false,
    ...overrides,
  };
}

describe("DeliverOrderUseCase", () => {
  it("transitions SHIPPED -> DELIVERED and writes an audit log entry", async () => {
    const shipped = order();
    const delivered = order({ status: "DELIVERED", deliveredAt: new Date() });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(shipped),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: delivered }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const notifyOrderEvent = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new DeliverOrderUseCase(orderRepository, auditLogger, transaction, notifyOrderEvent);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(result.changed).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "SHIPPED", "DELIVERED", "tx",
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "ORDER_DELIVERED" }), "tx");
    expect(notifyOrderEvent.execute).toHaveBeenCalledWith("order-1", "ORDER_DELIVERED");
  });

  it("rejects delivering an order that isn't SHIPPED", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "PROCESSING" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const notifyOrderEvent = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new DeliverOrderUseCase(orderRepository, auditLogger, transaction, notifyOrderEvent);

    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot deliver an order in status PROCESSING",
    );
  });
});
