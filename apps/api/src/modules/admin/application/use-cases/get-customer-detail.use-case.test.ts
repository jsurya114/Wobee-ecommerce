import { describe, expect, it, vi } from "vitest";
import { GetCustomerDetailUseCase } from "./get-customer-detail.use-case";

const customer = { id: "user-1", email: "a@test.woobe.internal", phone: null, name: "Test Customer", isActive: true, createdAt: new Date("2026-01-01") };

describe("GetCustomerDetailUseCase", () => {
  it("derives order count, total spent, and last order date from the fetched orders", async () => {
    const getCustomerForAdmin = { execute: vi.fn().mockResolvedValue(customer) };
    const orderReader = {
      listForUser: vi.fn().mockResolvedValue([
        { id: "o1", orderNumber: "A", status: "DELIVERED", paymentMethod: "COD", totalPaise: 1000, itemCount: 1, placedAt: new Date("2026-01-01") },
        { id: "o2", orderNumber: "B", status: "CONFIRMED", paymentMethod: "COD", totalPaise: 2500, itemCount: 2, placedAt: new Date("2026-03-01") },
      ]),
    };
    const addressReader = { listForUser: vi.fn().mockResolvedValue([]) };
    const useCase = new GetCustomerDetailUseCase(getCustomerForAdmin, orderReader, addressReader);

    const result = await useCase.execute("user-1");

    expect(result.activity.orderCount).toBe(2);
    expect(result.activity.totalSpentPaise).toBe(3500);
    expect(result.activity.lastOrderAt).toEqual(new Date("2026-03-01"));
  });

  it("returns a null lastOrderAt and zeroed totals for a customer with no orders", async () => {
    const getCustomerForAdmin = { execute: vi.fn().mockResolvedValue(customer) };
    const orderReader = { listForUser: vi.fn().mockResolvedValue([]) };
    const addressReader = { listForUser: vi.fn().mockResolvedValue([]) };
    const useCase = new GetCustomerDetailUseCase(getCustomerForAdmin, orderReader, addressReader);

    const result = await useCase.execute("user-1");

    expect(result.activity).toEqual({ orderCount: 0, totalSpentPaise: 0, lastOrderAt: null });
  });

  it("propagates a not-found/not-a-customer error from the customer lookup unchanged", async () => {
    const getCustomerForAdmin = { execute: vi.fn().mockRejectedValue(new Error("Customer not found")) };
    const orderReader = { listForUser: vi.fn() };
    const addressReader = { listForUser: vi.fn() };
    const useCase = new GetCustomerDetailUseCase(getCustomerForAdmin, orderReader, addressReader);

    await expect(useCase.execute("missing")).rejects.toThrow("Customer not found");
    expect(orderReader.listForUser).not.toHaveBeenCalled();
  });
});
