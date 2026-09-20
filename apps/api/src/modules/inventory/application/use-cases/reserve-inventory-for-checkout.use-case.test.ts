import { describe, expect, it, vi } from "vitest";
import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
import { ReserveInventoryForCheckoutUseCase } from "./reserve-inventory-for-checkout.use-case";

function fakeObservability(): ObservabilityPort {
  return { recordOrderCreated: vi.fn(), recordOrderEvent: vi.fn(), recordRefundIssued: vi.fn(), recordInventoryReservation: vi.fn(), recordPaymentWebhook: vi.fn() };
}

describe("ReserveInventoryForCheckoutUseCase — reservation metric", () => {
  it("records success when the reservation succeeds, and returns the repository outcome untouched", async () => {
    const outcome = { success: true, insufficient: [] };
    const observability = fakeObservability();
    const useCase = new ReserveInventoryForCheckoutUseCase({ reserveForCheckout: vi.fn().mockResolvedValue(outcome) } as never, observability);
    await expect(useCase.execute([{ variantId: "v", quantity: 1 }], "tx")).resolves.toBe(outcome);
    expect(observability.recordInventoryReservation).toHaveBeenCalledWith({ result: "success" });
  });

  it("records failure for insufficient stock", async () => {
    const outcome = { success: false, insufficient: [{ variantId: "v", requested: 5, available: 1 }] };
    const observability = fakeObservability();
    const useCase = new ReserveInventoryForCheckoutUseCase({ reserveForCheckout: vi.fn().mockResolvedValue(outcome) } as never, observability);
    await expect(useCase.execute([{ variantId: "v", quantity: 5 }], "tx")).resolves.toBe(outcome);
    expect(observability.recordInventoryReservation).toHaveBeenCalledWith({ result: "failure" });
  });

  it("records nothing if the repository itself throws (an infrastructure error is not a stock outcome)", async () => {
    const observability = fakeObservability();
    const useCase = new ReserveInventoryForCheckoutUseCase({ reserveForCheckout: vi.fn().mockRejectedValue(new Error("db down")) } as never, observability);
    await expect(useCase.execute([], "tx")).rejects.toThrow("db down");
    expect(observability.recordInventoryReservation).not.toHaveBeenCalled();
  });
});
