import { describe, expect, it, vi } from "vitest";
import { IssueRefundForCancelledOrderUseCase } from "./issue-refund-for-cancelled-order.use-case";
import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
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
    findByReturnId: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (input) => ({ id: "refund-db-1", createdAt: new Date(), ...input })),
    markCompletedByReturnId: vi.fn().mockResolvedValue(undefined),
  };
  const observability: ObservabilityPort = {
    recordOrderCreated: vi.fn(),
    recordOrderEvent: vi.fn(),
    recordRefundIssued: vi.fn(),
    recordInventoryReservation: vi.fn(),
    recordPaymentWebhook: vi.fn(),
  };
  const useCase = new IssueRefundForCancelledOrderUseCase(paymentReader, paymentRefundWriter, gateway, refundRepository, observability);
  return { useCase, paymentReader, paymentRefundWriter, gateway, refundRepository, observability };
}

describe("IssueRefundForCancelledOrderUseCase", () => {
  describe("COD with a prepaid delivery fee (COD shipping upfront, 2026-09-28)", () => {
    const codWithFee = {
      id: "p1",
      provider: "COD" as const,
      status: "PENDING" as const,
      amountPaise: 11_000,
      razorpayPaymentId: "pay_fee",
      upfrontAmountPaise: 5_000,
    };

    it("refunds ONLY the prepaid delivery fee, never the uncollected cash portion", async () => {
      const { useCase, gateway, refundRepository, paymentRefundWriter } = buildUseCase({ payment: codWithFee });
      const result = await useCase.execute("order-1");
      expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1", amountPaise: 5_000 });
      expect(gateway.refundPayment).toHaveBeenCalledWith("pay_fee", 5_000);
      expect(refundRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED", amountPaise: 5_000 }));
      expect(paymentRefundWriter.markRefunded).toHaveBeenCalledWith("p1");
    });

    it("refunds nothing while the delivery fee was never captured (no payment id yet)", async () => {
      const { useCase, gateway } = buildUseCase({ payment: { ...codWithFee, status: "CREATED", razorpayPaymentId: null } });
      expect(await useCase.execute("order-1")).toEqual({ refundIssued: false, reason: "not-applicable" });
      expect(gateway.refundPayment).not.toHaveBeenCalled();
    });

    it("records a FAILED row for the fee amount when the gateway refund fails", async () => {
      const { useCase, refundRepository } = buildUseCase({
        payment: codWithFee,
        refundPayment: vi.fn().mockRejectedValue(new Error("gateway down")),
      });
      expect(await useCase.execute("order-1")).toEqual({ refundIssued: false, reason: "gateway-error", amountPaise: 5_000 });
      expect(refundRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", amountPaise: 5_000 }));
    });
  });

  it("issues nothing when there is no payment (or it's COD) — nothing was ever collected pre-delivery, and this is not a metered refund attempt", async () => {
    const { useCase, gateway, observability } = buildUseCase({ payment: null });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(observability.recordRefundIssued).not.toHaveBeenCalled();
  });

  it("issues nothing for a COD payment even though status is CAPTURED", async () => {
    const { useCase, gateway } = buildUseCase({
      payment: { id: "p1", provider: "COD", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: null },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("refunds a captured Razorpay payment, writes a COMPLETED Refund row, marks the Payment refunded, and records success", async () => {
    const { useCase, paymentRefundWriter, refundRepository, observability } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1", amountPaise: 1000 });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "COMPLETED",
      amountPaise: 1000,
      providerRefundId: "rfnd_1",
    });
    expect(paymentRefundWriter.markRefunded).toHaveBeenCalledWith("p1");
    expect(observability.recordRefundIssued).toHaveBeenCalledWith({ result: "success" });
  });

  it("records a FAILED Refund row, a failure metric, and does not throw when the gateway call fails", async () => {
    const { useCase, refundRepository, observability } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
      refundPayment: vi.fn().mockRejectedValue(new Error("Razorpay is not configured")),
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "gateway-error", amountPaise: 1000 });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "FAILED",
      amountPaise: 1000,
      providerRefundId: undefined,
    });
    expect(observability.recordRefundIssued).toHaveBeenCalledWith({ result: "failure" });
  });

  it("still reports success when the gateway refund and COMPLETED row succeed but markRefunded fails afterward", async () => {
    const { useCase, paymentRefundWriter, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
    });
    paymentRefundWriter.markRefunded = vi.fn().mockRejectedValue(new Error("db blip"));
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1", amountPaise: 1000 });
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
