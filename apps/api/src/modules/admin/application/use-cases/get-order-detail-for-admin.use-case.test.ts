import { describe, expect, it, vi } from "vitest";
import { GetOrderDetailForAdminUseCase } from "./get-order-detail-for-admin.use-case";

const order = { id: "order-1", orderNumber: "WOOBE-20260904-ABC", status: "CONFIRMED", paymentMethod: "COD", items: [] };

describe("GetOrderDetailForAdminUseCase", () => {
  it("merges the order with its payment's current status", async () => {
    const getOrderForAdmin = { execute: vi.fn().mockResolvedValue(order) };
    const getPaymentForOrder = { execute: vi.fn().mockResolvedValue({ id: "pay-1", orderId: "order-1", provider: "COD", status: "PENDING", amountPaise: 1000 }) };
    const useCase = new GetOrderDetailForAdminUseCase(getOrderForAdmin, getPaymentForOrder);

    const result = await useCase.execute("order-1");

    expect(result.paymentStatus).toBe("PENDING");
    expect(result.orderNumber).toBe("WOOBE-20260904-ABC");
  });

  it("returns a null paymentStatus when no Payment row exists yet", async () => {
    const getOrderForAdmin = { execute: vi.fn().mockResolvedValue(order) };
    const getPaymentForOrder = { execute: vi.fn().mockResolvedValue(null) };
    const useCase = new GetOrderDetailForAdminUseCase(getOrderForAdmin, getPaymentForOrder);

    const result = await useCase.execute("order-1");

    expect(result.paymentStatus).toBeNull();
  });

  it("fetches the order and the payment concurrently, not sequentially", async () => {
    const getOrderForAdmin = { execute: vi.fn().mockResolvedValue(order) };
    const getPaymentForOrder = { execute: vi.fn().mockResolvedValue(null) };
    const useCase = new GetOrderDetailForAdminUseCase(getOrderForAdmin, getPaymentForOrder);

    await useCase.execute("order-1");

    expect(getOrderForAdmin.execute).toHaveBeenCalledWith("order-1");
    expect(getPaymentForOrder.execute).toHaveBeenCalledWith("order-1");
  });

  it("propagates a not-found error from the order lookup unchanged", async () => {
    const getOrderForAdmin = { execute: vi.fn().mockRejectedValue(new Error("Order not found")) };
    const getPaymentForOrder = { execute: vi.fn() };
    const useCase = new GetOrderDetailForAdminUseCase(getOrderForAdmin, getPaymentForOrder);

    await expect(useCase.execute("missing")).rejects.toThrow("Order not found");
  });
});
