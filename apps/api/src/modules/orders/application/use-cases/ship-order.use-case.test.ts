import { describe, expect, it, vi } from "vitest";
import { ShipOrderUseCase } from "./ship-order.use-case";
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
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

describe("ShipOrderUseCase", () => {
  it("transitions PROCESSING -> SHIPPED with tracking info and writes an audit log entry", async () => {
    const processing = order();
    const shipped = order({ status: "SHIPPED", trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: new Date() });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(processing),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: shipped }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new ShipOrderUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, {
      trackingNumber: "TRK1",
      carrier: "BlueDart",
    });

    expect(result.changed).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "PROCESSING", "SHIPPED", "tx",
      expect.objectContaining({ trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: expect.any(Date) }),
    );
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ORDER_SHIPPED", metadata: { trackingNumber: "TRK1", carrier: "BlueDart" } }),
      "tx",
    );
  });

  it("rejects shipping an order that isn't PROCESSING", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "CONFIRMED" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new ShipOrderUseCase(orderRepository, auditLogger, transaction);

    await expect(
      useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" }, { trackingNumber: "T", carrier: "C" }),
    ).rejects.toThrow("Cannot ship an order in status CONFIRMED");
  });
});
