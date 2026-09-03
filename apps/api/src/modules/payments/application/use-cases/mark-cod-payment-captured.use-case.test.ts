import { describe, expect, it, vi } from "vitest";
import { MarkCodPaymentCapturedUseCase } from "./mark-cod-payment-captured.use-case";
import type { PaymentEntity } from "../../domain/entities/payment.entity";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

function payment(overrides: Partial<PaymentEntity> = {}): PaymentEntity {
  return {
    id: "payment-1",
    orderId: "order-1",
    provider: "COD",
    status: "PENDING",
    amountPaise: 1000,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    ...overrides,
  };
}

function buildUseCase(findResult: PaymentEntity | null) {
  const paymentRepository = {
    findByOrderId: vi.fn().mockResolvedValue(findResult),
    update: vi.fn().mockResolvedValue(findResult ? { ...findResult, status: "CAPTURED" } : null),
  } as unknown as PaymentRepositoryPort;
  return { useCase: new MarkCodPaymentCapturedUseCase(paymentRepository), paymentRepository };
}

describe("MarkCodPaymentCapturedUseCase", () => {
  it("captures a PENDING COD payment", async () => {
    const { useCase, paymentRepository } = buildUseCase(payment());
    await useCase.execute("order-1");
    expect(paymentRepository.update).toHaveBeenCalledWith("payment-1", { status: "CAPTURED" });
  });

  it("is a no-op for a RAZORPAY payment", async () => {
    const { useCase, paymentRepository } = buildUseCase(payment({ provider: "RAZORPAY", status: "CAPTURED" }));
    await useCase.execute("order-1");
    expect(paymentRepository.update).not.toHaveBeenCalled();
  });

  it("is a no-op for an already-CAPTURED COD payment (idempotent)", async () => {
    const { useCase, paymentRepository } = buildUseCase(payment({ status: "CAPTURED" }));
    await useCase.execute("order-1");
    expect(paymentRepository.update).not.toHaveBeenCalled();
  });

  it("is a no-op when there's no Payment row at all", async () => {
    const { useCase, paymentRepository } = buildUseCase(null);
    await useCase.execute("order-1");
    expect(paymentRepository.update).not.toHaveBeenCalled();
  });
});
