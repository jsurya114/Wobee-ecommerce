import { describe, expect, it, vi } from "vitest";
import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
import { IssueRefundForReturnUseCase } from "./issue-refund-for-return.use-case";

function fakeObservability(): ObservabilityPort {
  return { recordOrderCreated: vi.fn(), recordOrderEvent: vi.fn(), recordRefundIssued: vi.fn(), recordInventoryReservation: vi.fn(), recordPaymentWebhook: vi.fn() };
}

function build(o: { payment?: unknown; existing?: unknown; gatewayFails?: boolean; markRefundedFails?: boolean } = {}) {
  const paymentReader = {
    findByOrderId: vi.fn().mockResolvedValue(o.payment === undefined ? { id: "p1", provider: "RAZORPAY", status: "CAPTURED", razorpayPaymentId: "pay_1", amountPaise: 1000 } : o.payment),
  };
  const paymentRefundWriter = { markRefunded: o.markRefundedFails ? vi.fn().mockRejectedValue(new Error("x")) : vi.fn().mockResolvedValue(undefined) };
  const gateway = { refundPayment: o.gatewayFails ? vi.fn().mockRejectedValue(new Error("gateway down")) : vi.fn().mockResolvedValue({ id: "rfnd_1" }) };
  const refundRepository = { findByReturnId: vi.fn().mockResolvedValue(o.existing ?? null), create: vi.fn().mockResolvedValue({ id: "r1" }) };
  const observability = fakeObservability();
  const useCase = new IssueRefundForReturnUseCase(paymentReader as never, paymentRefundWriter as never, gateway as never, refundRepository as never, observability);
  return { useCase, observability };
}

describe("IssueRefundForReturnUseCase — refund metric", () => {
  it("records success after the gateway refund succeeded", async () => {
    const { useCase, observability } = build();
    await expect(useCase.issue("ret1", "o1", 500)).resolves.toMatchObject({ outcome: "completed" });
    expect(observability.recordRefundIssued).toHaveBeenCalledTimes(1);
    expect(observability.recordRefundIssued).toHaveBeenCalledWith({ result: "success" });
  });

  it("still records success when only the follow-up markRefunded bookkeeping fails (the money did move)", async () => {
    const { useCase, observability } = build({ markRefundedFails: true });
    await useCase.issue("ret1", "o1", 500);
    expect(observability.recordRefundIssued).toHaveBeenCalledWith({ result: "success" });
  });

  it("records failure when the gateway refund fails", async () => {
    const { useCase, observability } = build({ gatewayFails: true });
    await expect(useCase.issue("ret1", "o1", 500)).resolves.toMatchObject({ outcome: "failed" });
    expect(observability.recordRefundIssued).toHaveBeenCalledTimes(1);
    expect(observability.recordRefundIssued).toHaveBeenCalledWith({ result: "failure" });
  });

  it("records nothing when there is nothing to refund at the gateway (COD / not captured) — that is not a refund attempt", async () => {
    const { useCase, observability } = build({ payment: { id: "p1", provider: "COD", status: "PENDING", razorpayPaymentId: null, amountPaise: 1000 } });
    await expect(useCase.issue("ret1", "o1", 500)).resolves.toMatchObject({ outcome: "not-applicable" });
    expect(observability.recordRefundIssued).not.toHaveBeenCalled();
  });

  it("records nothing on an idempotent replay of an already-issued refund (no double-count)", async () => {
    const { useCase, observability } = build({ existing: { id: "r0", status: "COMPLETED" } });
    await expect(useCase.issue("ret1", "o1", 500)).resolves.toMatchObject({ outcome: "completed", refundId: "r0" });
    expect(observability.recordRefundIssued).not.toHaveBeenCalled();
  });
});
