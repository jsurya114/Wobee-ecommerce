import { describe, expect, it, vi } from "vitest";
import { IssueRefundForCancelledOrderUseCase } from "./issue-refund-for-cancelled-order.use-case";
import type { PaymentReaderPort } from "../ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "../ports/payment-refund-writer.port";
import type { RazorpayRefundGatewayPort } from "../ports/razorpay-refund-gateway.port";
import type { RefundRepositoryPort } from "../ports/refund-repository.port";

function buildUseCase(overrides: {
  payment?: Awaited<ReturnType<PaymentReaderPort["findByOrderId"]>>;
  refundPayment?: RazorpayRefundGatewayPort["refundPayment"];
  existingRefund?: Awaited<ReturnType<RefundRepositoryPort["findByOrderId"]>>;
}) {
  const paymentReader: PaymentReaderPort = { findByOrderId: vi.fn().mockResolvedValue(overrides.payment ?? null) };
  const paymentRefundWriter: PaymentRefundWriterPort = { markRefunded: vi.fn().mockResolvedValue(undefined) };
  const gateway: RazorpayRefundGatewayPort = {
    refundPayment: overrides.refundPayment ?? vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed" }),
  };
  const refundRepository: RefundRepositoryPort = {
    findByOrderId: vi.fn().mockResolvedValue(overrides.existingRefund ?? null),
    create: vi.fn().mockImplementation(async (input) => ({ id: "refund-db-1", createdAt: new Date(), ...input })),
  };
  const useCase = new IssueRefundForCancelledOrderUseCase(paymentReader, paymentRefundWriter, gateway, refundRepository);
  return { useCase, paymentReader, paymentRefundWriter, gateway, refundRepository };
}

describe("IssueRefundForCancelledOrderUseCase", () => {
  it("issues nothing when there is no payment (or it's COD) — nothing was ever collected pre-delivery", async () => {
    const { useCase, gateway } = buildUseCase({ payment: null });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("issues nothing for a COD payment even though status is CAPTURED", async () => {
    const { useCase, gateway } = buildUseCase({
      payment: { id: "p1", provider: "COD", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: null },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("refunds a captured Razorpay payment, writes a COMPLETED Refund row, and marks the Payment refunded", async () => {
    const { useCase, paymentRefundWriter, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1" });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "COMPLETED",
      amountPaise: 1000,
      providerRefundId: "rfnd_1",
    });
    expect(paymentRefundWriter.markRefunded).toHaveBeenCalledWith("p1");
  });

  it("records a FAILED Refund row and does not throw when the gateway call fails", async () => {
    const { useCase, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
      refundPayment: vi.fn().mockRejectedValue(new Error("Razorpay is not configured")),
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "gateway-error" });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "FAILED",
      amountPaise: 1000,
      providerRefundId: undefined,
    });
  });

  it("still reports success when the gateway refund and COMPLETED row succeed but markRefunded fails afterward", async () => {
    const { useCase, paymentRefundWriter, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
    });
    paymentRefundWriter.markRefunded = vi.fn().mockRejectedValue(new Error("db blip"));
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1" });
    expect(refundRepository.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — skips the gateway entirely when a Refund row already exists for the order", async () => {
    const { useCase, gateway } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
      existingRefund: {
        id: "existing", orderId: "order-1", returnId: null, provider: "RAZORPAY",
        status: "COMPLETED", amountPaise: 1000, providerRefundId: "rfnd_0", createdAt: new Date(),
      },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "existing" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});
