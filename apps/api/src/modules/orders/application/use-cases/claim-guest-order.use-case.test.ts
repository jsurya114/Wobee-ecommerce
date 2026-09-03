import { describe, expect, it, vi } from "vitest";
import { ClaimGuestOrderUseCase } from "./claim-guest-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { ClaimAttemptLimiterPort } from "../ports/claim-attempt-limiter.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

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

function buildUseCase(overrides: { findResult?: OrderEntity | null; attachResult?: boolean; allowResult?: boolean } = {}) {
  const orderRepository = {
    findByOrderNumber: vi.fn().mockResolvedValue(overrides.findResult === undefined ? order() : overrides.findResult),
    attachToUser: vi.fn().mockResolvedValue(overrides.attachResult ?? true),
  } as unknown as OrderRepositoryPort;
  const attemptLimiter: ClaimAttemptLimiterPort = { allow: vi.fn().mockResolvedValue(overrides.allowResult ?? true) };
  const useCase = new ClaimGuestOrderUseCase(orderRepository, attemptLimiter);
  return { useCase, orderRepository, attemptLimiter };
}

describe("ClaimGuestOrderUseCase", () => {
  it("attaches a matching, still-guest order to the caller's account", async () => {
    const { useCase, orderRepository } = buildUseCase();

    const result = await useCase.execute({ userId: "user-1", orderNumber: "WOOBE-20260903-A1B2C3D4E5F6", contactEmail: "guest@a.com" });

    expect(result.userId).toBe("user-1");
    expect(orderRepository.findByOrderNumber).toHaveBeenCalledWith("WOOBE-20260903-A1B2C3D4E5F6");
    expect(orderRepository.attachToUser).toHaveBeenCalledWith("order-1", "user-1");
  });

  it("rejects (NotFoundError) when no order matches the number", async () => {
    const { useCase, orderRepository } = buildUseCase({ findResult: null });
    await expect(useCase.execute({ userId: "user-1", orderNumber: "WOOBE-NOPE", contactEmail: "guest@a.com" })).rejects.toThrow(
      "No matching guest order found",
    );
    expect(orderRepository.attachToUser).not.toHaveBeenCalled();
  });

  it("rejects (same NotFoundError, not a distinct message) when the email doesn't match", async () => {
    const { useCase, orderRepository } = buildUseCase({ findResult: order({ contactEmail: "guest@a.com" }) });
    await expect(
      useCase.execute({ userId: "user-1", orderNumber: "WOOBE-20260903-A1B2C3D4E5F6", contactEmail: "wrong@a.com" }),
    ).rejects.toThrow("No matching guest order found");
    expect(orderRepository.attachToUser).not.toHaveBeenCalled();
  });

  it("rejects (same NotFoundError) when the order is already owned by an account", async () => {
    const { useCase } = buildUseCase({ findResult: order({ userId: "someone-else" }) });
    await expect(
      useCase.execute({ userId: "user-1", orderNumber: "WOOBE-20260903-A1B2C3D4E5F6", contactEmail: "guest@a.com" }),
    ).rejects.toThrow("No matching guest order found");
  });

  it("rejects (same NotFoundError) when attachToUser loses a race (already claimed between read and write)", async () => {
    const { useCase } = buildUseCase({ attachResult: false });
    await expect(
      useCase.execute({ userId: "user-1", orderNumber: "WOOBE-20260903-A1B2C3D4E5F6", contactEmail: "guest@a.com" }),
    ).rejects.toThrow("No matching guest order found");
  });

  it("throws TooManyRequestsError and never touches the repository once the attempt limiter says no", async () => {
    const { useCase, orderRepository } = buildUseCase({ allowResult: false });
    await expect(
      useCase.execute({ userId: "user-1", orderNumber: "WOOBE-20260903-A1B2C3D4E5F6", contactEmail: "guest@a.com" }),
    ).rejects.toThrow("Too many attempts");
    expect(orderRepository.findByOrderNumber).not.toHaveBeenCalled();
  });
});
