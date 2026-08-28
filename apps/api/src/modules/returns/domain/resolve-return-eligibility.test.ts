import { describe, expect, it } from "vitest";
import { resolveReturnEligibility, RETURN_WINDOW_DAYS } from "./resolve-return-eligibility";

const baseCtx = {
  now: new Date("2026-06-15"),
  orderStatus: "DELIVERED",
  deliveredAt: new Date("2026-06-10"),
  orderItems: [{ id: "item-1", quantity: 3 }],
  existingReturnLines: [] as { orderItemId: string; quantity: number; status: import("./entities/return.entity").ReturnStatus }[],
  requestedLines: [{ orderItemId: "item-1", quantity: 1 }],
};

describe("resolveReturnEligibility", () => {
  it("accepts a well-formed request within the window", () => {
    expect(resolveReturnEligibility(baseCtx).ok).toBe(true);
  });

  it("rejects an order that was never delivered", () => {
    const result = resolveReturnEligibility({ ...baseCtx, orderStatus: "SHIPPED" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/only delivered orders/i);
  });

  it("rejects a delivered order with no recorded deliveredAt (defensive)", () => {
    const result = resolveReturnEligibility({ ...baseCtx, deliveredAt: null });
    expect(result.ok).toBe(false);
  });

  it(`rejects once ${RETURN_WINDOW_DAYS} days past delivery have elapsed`, () => {
    const justPast = new Date(baseCtx.deliveredAt);
    justPast.setDate(justPast.getDate() + RETURN_WINDOW_DAYS + 1);
    const result = resolveReturnEligibility({ ...baseCtx, now: justPast });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/return window/i);
  });

  it(`accepts exactly at the ${RETURN_WINDOW_DAYS}-day boundary`, () => {
    const boundary = new Date(baseCtx.deliveredAt);
    boundary.setDate(boundary.getDate() + RETURN_WINDOW_DAYS);
    expect(resolveReturnEligibility({ ...baseCtx, now: boundary }).ok).toBe(true);
  });

  it("rejects an empty line list", () => {
    const result = resolveReturnEligibility({ ...baseCtx, requestedLines: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/select at least one/i);
  });

  it("rejects a zero or negative quantity", () => {
    const result = resolveReturnEligibility({ ...baseCtx, requestedLines: [{ orderItemId: "item-1", quantity: 0 }] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/at least 1/i);
  });

  it("rejects a line referencing an order item that isn't on this order", () => {
    const result = resolveReturnEligibility({ ...baseCtx, requestedLines: [{ orderItemId: "not-on-order", quantity: 1 }] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/isn't part of this order/i);
  });

  it("rejects requesting more than the ordered quantity", () => {
    const result = resolveReturnEligibility({ ...baseCtx, requestedLines: [{ orderItemId: "item-1", quantity: 4 }] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already requested returning/i);
  });

  it("rejects a second request once a pending request already claims the remaining quantity", () => {
    const ctx = {
      ...baseCtx,
      existingReturnLines: [{ orderItemId: "item-1", quantity: 3, status: "RETURN_REQUESTED" as const }],
      requestedLines: [{ orderItemId: "item-1", quantity: 1 }],
    };
    expect(resolveReturnEligibility(ctx).ok).toBe(false);
  });

  it("allows a new request once a prior REJECTED request freed its quantity back up", () => {
    const ctx = {
      ...baseCtx,
      existingReturnLines: [{ orderItemId: "item-1", quantity: 3, status: "RETURN_REJECTED" as const }],
      requestedLines: [{ orderItemId: "item-1", quantity: 3 }],
    };
    expect(resolveReturnEligibility(ctx).ok).toBe(true);
  });

  it("permanently counts an already-REFUNDED line against the ordered quantity", () => {
    const ctx = {
      ...baseCtx,
      existingReturnLines: [{ orderItemId: "item-1", quantity: 3, status: "REFUNDED" as const }],
      requestedLines: [{ orderItemId: "item-1", quantity: 1 }],
    };
    expect(resolveReturnEligibility(ctx).ok).toBe(false);
  });

  it("allows a partial return that leaves quantity remaining for a later request", () => {
    const ctx = {
      ...baseCtx,
      existingReturnLines: [{ orderItemId: "item-1", quantity: 1, status: "REFUNDED" as const }],
      requestedLines: [{ orderItemId: "item-1", quantity: 2 }],
    };
    expect(resolveReturnEligibility(ctx).ok).toBe(true);
  });
});
