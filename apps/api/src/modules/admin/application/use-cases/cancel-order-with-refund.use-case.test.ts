import { describe, expect, it, vi } from "vitest";
import { CancelOrderWithRefundUseCase } from "./cancel-order-with-refund.use-case";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import type { OrderEntity } from "../../../orders/domain/entities/order.entity";
import type { CancelOrderUseCase } from "../../../orders/application/use-cases/cancel-order.use-case";
import type { IssueRefundForCancelledOrderUseCase } from "../../../refunds/application/use-cases/issue-refund-for-cancelled-order.use-case";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "CANCELLED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "RAZORPAY", placedAt: new Date(),
    items: [{ id: "item-1", variantId: "variant-1", productNameSnapshot: "P", skuSnapshot: "SKU", color: "Red", size: "M", weightGrams: 100, unitRatePerKgPaise: 1000, unitPricePaise: 100, quantity: 2, lineTotalPaise: 200, taxAmountPaise: 10 }],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: new Date(), cancellationReason: null,
    ...overrides,
  };
}

function buildUseCase(overrides: { changed?: boolean; refundIssued?: boolean } = {}) {
  const cancelled = order();
  const cancelOrderUseCase = {
    execute: vi.fn().mockResolvedValue({ order: cancelled, changed: overrides.changed ?? true }),
  } as unknown as CancelOrderUseCase;
  const issueRefundForCancelledOrderUseCase = {
    execute: vi.fn().mockResolvedValue({ refundIssued: overrides.refundIssued ?? true }),
  } as unknown as IssueRefundForCancelledOrderUseCase;
  const recordAuditLogUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as RecordAuditLogUseCase;
  const useCase = new CancelOrderWithRefundUseCase(cancelOrderUseCase, issueRefundForCancelledOrderUseCase, recordAuditLogUseCase);
  return { useCase, cancelOrderUseCase, issueRefundForCancelledOrderUseCase, recordAuditLogUseCase, cancelled };
}

describe("CancelOrderWithRefundUseCase", () => {
  it("cancels the order, triggers a refund, and writes the ORDER_CANCELLED audit entry", async () => {
    const { useCase, cancelOrderUseCase, issueRefundForCancelledOrderUseCase, recordAuditLogUseCase } = buildUseCase();

    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, "Customer request");

    expect(result.refundIssued).toBe(true);
    expect(result.order.status).toBe("CANCELLED");
    expect(cancelOrderUseCase.execute).toHaveBeenCalledWith("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, "Customer request");
    expect(issueRefundForCancelledOrderUseCase.execute).toHaveBeenCalledWith("order-1");
    expect(recordAuditLogUseCase.execute).toHaveBeenCalledWith({
      actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_CANCELLED",
      entityType: "Order", entityId: "order-1", metadata: { reason: "Customer request", refundIssued: true },
    });
  });

  it("still reports the order as cancelled — and still audits — when the refund attempt fails", async () => {
    const { useCase, recordAuditLogUseCase } = buildUseCase({ refundIssued: false });

    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });

    expect(result.refundIssued).toBe(false);
    expect(result.order.status).toBe("CANCELLED"); // cancellation itself still succeeded
    expect(recordAuditLogUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: undefined, refundIssued: false } }),
    );
  });

  it("is idempotent — a concurrent cancel that already won skips the refund and the audit entry entirely", async () => {
    const { useCase, issueRefundForCancelledOrderUseCase, recordAuditLogUseCase } = buildUseCase({ changed: false });

    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });

    expect(result.refundIssued).toBe(false);
    expect(issueRefundForCancelledOrderUseCase.execute).not.toHaveBeenCalled();
    expect(recordAuditLogUseCase.execute).not.toHaveBeenCalled();
  });
});
