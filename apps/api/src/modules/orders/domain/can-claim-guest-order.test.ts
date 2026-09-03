import { describe, expect, it } from "vitest";
import { canClaimGuestOrder } from "./can-claim-guest-order";
import type { OrderEntity } from "./entities/order.entity";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1",
    orderNumber: "WOOBE-20260903-A1B2C3D4E5F6",
    userId: null,
    status: "CONFIRMED",
    contactName: "A",
    contactPhone: "1",
    contactEmail: "guest@a.com",
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
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    hasActiveReturn: false,
    items: [],
    ...overrides,
  };
}

describe("canClaimGuestOrder", () => {
  it("allows claiming an unowned order whose email matches exactly", () => {
    expect(canClaimGuestOrder(order(), "guest@a.com")).toBe(true);
  });

  it("rejects an order that already belongs to an account", () => {
    expect(canClaimGuestOrder(order({ userId: "user-1" }), "guest@a.com")).toBe(false);
  });

  it("rejects a mismatched email", () => {
    expect(canClaimGuestOrder(order(), "someone-else@a.com")).toBe(false);
  });
});
