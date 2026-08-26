import { describe, expect, it, vi } from "vitest";
import { CancelOrderUseCase } from "./cancel-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { InventoryReleasePort } from "../ports/inventory-release.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "CONFIRMED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "RAZORPAY", placedAt: new Date(),
    items: [{ id: "item-1", variantId: "variant-1", productNameSnapshot: "P", skuSnapshot: "SKU", color: "Red", size: "M", weightGrams: 100, unitRatePerKgPaise: 1000, unitPricePaise: 100, quantity: 2, lineTotalPaise: 200, taxAmountPaise: 10 }],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

function buildUseCase(overrides: { findByIdResult?: OrderEntity; transitionChanged?: boolean; refundIssued?: boolean } = {}) {
  const confirmed = overrides.findByIdResult ?? order();
  const cancelled = order({ status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Customer request" });
  const orderRepository = {
    findById: vi.fn().mockResolvedValue(confirmed),
    transitionStatus: vi.fn().mockResolvedValue({ changed: overrides.transitionChanged ?? true, order: cancelled }),
  } as unknown as OrderRepositoryPort;
  const inventoryRelease: InventoryReleasePort = { release: vi.fn().mockResolvedValue(undefined) };
  const refundIssuer: RefundIssuerPort = { issueRefundIfNeeded: vi.fn().mockResolvedValue({ refundIssued: overrides.refundIssued ?? true }) };
  const auditLogger: AuditLoggerPort = { log: vi.fn().mockResolvedValue(undefined) };
  const transaction: TransactionPort = { run: (fn) => fn("tx") };
  const useCase = new CancelOrderUseCase(orderRepository, inventoryRelease, refundIssuer, auditLogger, transaction);
  return { useCase, orderRepository, inventoryRelease, refundIssuer, auditLogger };
}

describe("CancelOrderUseCase", () => {
  it("cancels a CONFIRMED order, releases inventory, triggers a refund, and logs it", async () => {
    const { useCase, orderRepository, inventoryRelease, refundIssuer, auditLogger } = buildUseCase();

    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, "Customer request");

    expect(result.refundIssued).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "CONFIRMED", "CANCELLED", "tx",
      expect.objectContaining({ cancelledAt: expect.any(Date), cancellationReason: "Customer request" }),
    );
    expect(inventoryRelease.release).toHaveBeenCalledWith([{ variantId: "variant-1", quantity: 2 }], "tx");
    expect(refundIssuer.issueRefundIfNeeded).toHaveBeenCalledWith("order-1");
    expect(auditLogger.log).toHaveBeenCalledWith({
      actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_CANCELLED",
      entityType: "Order", entityId: "order-1", metadata: { reason: "Customer request", refundIssued: true },
    });
  });

  it("also allows cancelling a PROCESSING order", async () => {
    const { useCase, orderRepository } = buildUseCase({ findByIdResult: order({ status: "PROCESSING" }) });
    await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith("order-1", "PROCESSING", "CANCELLED", "tx", expect.anything());
  });

  it("rejects cancelling an order that is already SHIPPED", async () => {
    const { useCase } = buildUseCase({ findByIdResult: order({ status: "SHIPPED" }) });
    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot cancel an order in status SHIPPED",
    );
  });

  it("is idempotent — a concurrent cancel that already won skips inventory release and refund entirely", async () => {
    const { useCase, inventoryRelease, refundIssuer, auditLogger } = buildUseCase({ transitionChanged: false });
    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.refundIssued).toBe(false);
    expect(inventoryRelease.release).not.toHaveBeenCalled();
    expect(refundIssuer.issueRefundIfNeeded).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("still reports the order as cancelled even when the refund attempt fails", async () => {
    const { useCase, auditLogger } = buildUseCase({ refundIssued: false });
    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.refundIssued).toBe(false);
    expect(result.order.status).toBe("CANCELLED"); // cancellation itself still succeeded
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: undefined, refundIssued: false } }));
  });
});
