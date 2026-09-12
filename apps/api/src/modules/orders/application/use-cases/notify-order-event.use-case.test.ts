import { describe, expect, it, vi } from "vitest";
import { NotifyOrderEventUseCase } from "./notify-order-event.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1",
    orderNumber: "WOOBE-20260910-XYZ",
    userId: "user-1",
    status: "CONFIRMED",
    contactName: "Asha Rao",
    contactPhone: "9876543210",
    contactEmail: "asha@example.com",
    shippingSnapshot: { fullName: "Asha Rao", phone: "9876543210", line1: "1 MG Road", line2: "Flat 4", city: "Kochi", state: "Kerala", pincode: "682001" },
    subtotalPaise: 148800,
    discountPaise: 14880,
    shippingFeePaise: 5000,
    taxPaise: 6696,
    totalPaise: 145616,
    totalWeightGrams: 1240,
    paymentMethod: "RAZORPAY",
    placedAt: new Date("2026-09-10T10:00:00Z"),
    items: [
      {
        id: "oi-1",
        variantId: "v-1",
        productNameSnapshot: "Ribbed Knit Sweater",
        skuSnapshot: "RKS-OAT-S",
        color: "Oatmeal",
        size: "S",
        weightGrams: 620,
        pricingMode: "WEIGHT_BASED",
        unitRatePerKgPaise: 120000,
        unitPricePaise: 74400,
        quantity: 2,
        lineTotalPaise: 148800,
        taxAmountPaise: 6696,
        discountPaise: 14880,
      },
    ],
    trackingNumber: null,
    carrier: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    hasActiveReturn: false,
    ...overrides,
  } as OrderEntity;
}

function build(o: OrderEntity | null) {
  const orderRepository = { findById: vi.fn().mockResolvedValue(o) } as unknown as OrderRepositoryPort;
  const notificationEnqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
  return { useCase: new NotifyOrderEventUseCase(orderRepository, notificationEnqueuer), notificationEnqueuer };
}

describe("NotifyOrderEventUseCase", () => {
  it("ORDER_CONFIRMED — enqueues the full itemised invoice payload to the order's own contactEmail", async () => {
    const { useCase, notificationEnqueuer } = build(order());
    await useCase.execute("order-1", "ORDER_CONFIRMED");

    expect(notificationEnqueuer.enqueue).toHaveBeenCalledTimes(1);
    const arg = notificationEnqueuer.enqueue.mock.calls[0]![0];
    expect(arg).toMatchObject({ userId: "user-1", type: "ORDER_CONFIRMED", channel: "EMAIL" });
    expect(arg.payload).toMatchObject({
      contactEmail: "asha@example.com",
      contactName: "Asha Rao",
      orderNumber: "WOOBE-20260910-XYZ",
      paymentMethod: "RAZORPAY",
      paymentStatus: "PAID",
      subtotalPaise: 148800,
      discountPaise: 14880,
      shippingFeePaise: 5000,
      taxPaise: 6696,
      totalPaise: 145616,
    });
    expect(arg.payload.items).toEqual([
      { name: "Ribbed Knit Sweater", color: "Oatmeal", size: "S", quantity: 2, unitPricePaise: 74400, lineTotalPaise: 148800 },
    ]);
    expect(arg.payload.shippingAddress).toMatchObject({ city: "Kochi", state: "Kerala", pincode: "682001", line2: "Flat 4" });
  });

  it("ORDER_CONFIRMED — a COD order reports PAY_ON_DELIVERY, never PAID", async () => {
    const { useCase, notificationEnqueuer } = build(order({ paymentMethod: "COD" }));
    await useCase.execute("order-1", "ORDER_CONFIRMED");
    expect(notificationEnqueuer.enqueue.mock.calls[0]![0].payload.paymentStatus).toBe("PAY_ON_DELIVERY");
  });

  it("ORDER_SHIPPED — carries tracking number + carrier when present", async () => {
    const { useCase, notificationEnqueuer } = build(order({ status: "SHIPPED", trackingNumber: "TRK9", carrier: "BlueDart" }));
    await useCase.execute("order-1", "ORDER_SHIPPED");
    expect(notificationEnqueuer.enqueue.mock.calls[0]![0].payload).toMatchObject({
      orderNumber: "WOOBE-20260910-XYZ",
      trackingNumber: "TRK9",
      carrier: "BlueDart",
    });
  });

  it("ORDER_SHIPPED — no invoice line items leak into a shipped/delivered payload", async () => {
    const { useCase, notificationEnqueuer } = build(order({ status: "SHIPPED" }));
    await useCase.execute("order-1", "ORDER_SHIPPED");
    expect(notificationEnqueuer.enqueue.mock.calls[0]![0].payload.items).toBeUndefined();
  });

  it("PAYMENT_FAILED / ORDER_DELIVERED — minimal payload, still addressed to the order's contactEmail", async () => {
    for (const type of ["PAYMENT_FAILED", "ORDER_DELIVERED"] as const) {
      const { useCase, notificationEnqueuer } = build(order());
      await useCase.execute("order-1", type);
      expect(notificationEnqueuer.enqueue.mock.calls[0]![0]).toMatchObject({
        type,
        payload: { contactEmail: "asha@example.com", orderNumber: "WOOBE-20260910-XYZ", totalPaise: 145616 },
      });
    }
  });

  it("silently no-ops (never throws, never enqueues) when the order is gone", async () => {
    const { useCase, notificationEnqueuer } = build(null);
    await expect(useCase.execute("missing", "ORDER_CONFIRMED")).resolves.toBeUndefined();
    expect(notificationEnqueuer.enqueue).not.toHaveBeenCalled();
  });
});
