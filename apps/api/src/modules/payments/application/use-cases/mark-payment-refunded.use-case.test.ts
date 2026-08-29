import { describe, expect, it, vi } from "vitest";
import { MarkPaymentRefundedUseCase } from "./mark-payment-refunded.use-case";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

describe("MarkPaymentRefundedUseCase", () => {
  it("calls the repository's markRefunded with the given payment id", async () => {
    const markRefunded = vi.fn().mockResolvedValue(undefined);
    const repository = { markRefunded } as unknown as PaymentRepositoryPort;
    const useCase = new MarkPaymentRefundedUseCase(repository);

    await useCase.execute("payment-1");

    expect(markRefunded).toHaveBeenCalledWith("payment-1", undefined);
  });
});
