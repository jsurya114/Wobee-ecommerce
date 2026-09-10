import { describe, expect, it, vi } from "vitest";
import { RequestReturnUseCase } from "./request-return.use-case";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

const deliveredOrder = {
  id: "order-1",
  userId: "user-1",
  status: "DELIVERED",
  deliveredAt: new Date(),
  contactEmail: "a@a.com",
  orderNumber: "WOOBE-1",
  items: [{ id: "item-1", variantId: "v1", productNameSnapshot: "Scarf", quantity: 2, unitPricePaise: 1000, taxAmountPaise: 100, discountPaise: 0 }],
};

function buildUseCase(overrides: { orderReader?: Partial<OrderReaderPort>; existingLines?: unknown[] } = {}) {
  const orderReader = { forCustomer: vi.fn().mockResolvedValue(deliveredOrder), forAdmin: vi.fn(), ...overrides.orderReader } as unknown as OrderReaderPort;
  const returnRepository = {
    findLinesByOrderId: vi.fn().mockResolvedValue(overrides.existingLines ?? []),
    create: vi.fn().mockResolvedValue({ id: "return-1", orderId: "order-1", status: "RETURN_REQUESTED", reason: "wrong size", requestedAt: new Date(), resolvedAt: null, items: [] }),
  } as unknown as ReturnRepositoryPort;
  const orderReturnFlagWriter = { setHasActiveReturn: vi.fn() } as unknown as OrderReturnFlagWriterPort;
  const notificationEnqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const useCase = new RequestReturnUseCase(orderReader, returnRepository, orderReturnFlagWriter, notificationEnqueuer);
  return { useCase, orderReader, returnRepository, orderReturnFlagWriter, notificationEnqueuer };
}

describe("RequestReturnUseCase", () => {
  it("creates the return and flags the order as having an active return", async () => {
    const { useCase, returnRepository, orderReturnFlagWriter } = buildUseCase();

    const result = await useCase.execute({ orderId: "order-1", userId: "user-1", reason: "wrong size", items: [{ orderItemId: "item-1", quantity: 1 }] });

    expect(result.id).toBe("return-1");
    expect(returnRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      reason: "wrong size",
      items: [{ orderItemId: "item-1", quantity: 1 }],
    });
    expect(orderReturnFlagWriter.setHasActiveReturn).toHaveBeenCalledWith("order-1", true);
  });

  it("enqueues a RETURN_REQUESTED confirmation email after the return row is created", async () => {
    const { useCase, notificationEnqueuer } = buildUseCase();
    await useCase.execute({ orderId: "order-1", userId: "user-1", reason: "wrong size", items: [{ orderItemId: "item-1", quantity: 2 }] });
    expect(notificationEnqueuer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "RETURN_REQUESTED",
        channel: "EMAIL",
        payload: expect.objectContaining({ contactEmail: "a@a.com", orderNumber: "WOOBE-1", returnId: "return-1", itemCount: 2 }),
      }),
    );
  });

  it("a failing notification enqueue does NOT fail the return request", async () => {
    const { useCase, notificationEnqueuer } = buildUseCase();
    notificationEnqueuer.enqueue.mockRejectedValueOnce(new Error("redis down"));
    const result = await useCase.execute({ orderId: "order-1", userId: "user-1", reason: "wrong size", items: [{ orderItemId: "item-1", quantity: 1 }] });
    expect(result.id).toBe("return-1");
  });

  it("rejects (without creating a Return row) when the order isn't eligible", async () => {
    const { useCase, returnRepository } = buildUseCase({
      orderReader: { forCustomer: vi.fn().mockResolvedValue({ ...deliveredOrder, status: "SHIPPED" }) },
    });

    await expect(
      useCase.execute({ orderId: "order-1", userId: "user-1", reason: "wrong size", items: [{ orderItemId: "item-1", quantity: 1 }] }),
    ).rejects.toThrow(/only delivered orders/i);
    expect(returnRepository.create).not.toHaveBeenCalled();
  });

  it("propagates the order reader's own not-found/not-owned error unchanged", async () => {
    const { useCase } = buildUseCase({ orderReader: { forCustomer: vi.fn().mockRejectedValue(new Error("Order not found")) } });

    await expect(
      useCase.execute({ orderId: "order-1", userId: "user-1", reason: "wrong size", items: [{ orderItemId: "item-1", quantity: 1 }] }),
    ).rejects.toThrow("Order not found");
  });
});
