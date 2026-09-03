import { describe, expect, it, vi } from "vitest";
import { DeliverOrderAndCapturePaymentUseCase } from "./deliver-order-and-capture-payment.use-case";
import type { OrderEntity } from "../../../orders/domain/entities/order.entity";
import type { TransitionOrderStatusResult } from "../../../orders/application/ports/order-repository.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1",
    orderNumber: "WOOBE-1",
    userId: "user-1",
    status: "DELIVERED",
    contactName: "A",
    contactPhone: "1",
    contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100,
    discountPaise: 0,
    shippingFeePaise: 0,
    taxPaise: 0,
    totalPaise: 100,
    totalWeightGrams: 100,
    paymentMethod: "COD",
    placedAt: new Date(),
    trackingNumber: null,
    carrier: null,
    shippedAt: null,
    deliveredAt: new Date(),
    cancelledAt: null,
    cancellationReason: null,
    hasActiveReturn: false,
    items: [],
    ...overrides,
  };
}

function buildUseCase(deliverResult: TransitionOrderStatusResult) {
  const deliverOrderUseCase = { execute: vi.fn().mockResolvedValue(deliverResult) };
  const markCodPaymentCapturedUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
  const useCase = new DeliverOrderAndCapturePaymentUseCase(deliverOrderUseCase, markCodPaymentCapturedUseCase);
  return { useCase, deliverOrderUseCase, markCodPaymentCapturedUseCase };
}

describe("DeliverOrderAndCapturePaymentUseCase", () => {
  it("delivers the order then captures its COD payment", async () => {
    const { useCase, deliverOrderUseCase, markCodPaymentCapturedUseCase } = buildUseCase({ changed: true, order: order() });

    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(deliverOrderUseCase.execute).toHaveBeenCalledWith("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });
    expect(markCodPaymentCapturedUseCase.execute).toHaveBeenCalledWith("order-1");
    expect(result.changed).toBe(true);
  });

  it("does not attempt a payment capture when delivery was a no-op (already DELIVERED)", async () => {
    const { useCase, markCodPaymentCapturedUseCase } = buildUseCase({ changed: false, order: order() });
    await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });
    expect(markCodPaymentCapturedUseCase.execute).not.toHaveBeenCalled();
  });

  it("still attempts a capture for a RAZORPAY order — MarkCodPaymentCapturedUseCase itself is what no-ops on provider, not this use-case", async () => {
    const { useCase, markCodPaymentCapturedUseCase } = buildUseCase({ changed: true, order: order({ paymentMethod: "RAZORPAY" }) });
    await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });
    expect(markCodPaymentCapturedUseCase.execute).toHaveBeenCalledWith("order-1");
  });
});
