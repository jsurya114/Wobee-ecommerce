import { describe, expect, it, vi } from "vitest";
import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
import { ConfirmCodOrderUseCase } from "./confirm-cod-order.use-case";

function fakeObservability(): ObservabilityPort {
  return { recordOrderCreated: vi.fn(), recordOrderEvent: vi.fn(), recordRefundIssued: vi.fn(), recordInventoryReservation: vi.fn(), recordPaymentWebhook: vi.fn() };
}

function build(opts: { status?: string; paymentMethod?: string; confirmChanged?: boolean; txFails?: boolean; notifyFails?: boolean } = {}) {
  const order = { id: "o1", userId: null, status: opts.status ?? "PENDING_PAYMENT", paymentMethod: opts.paymentMethod ?? "COD", totalPaise: 500, items: [] };
  const orderPort = {
    getOrder: vi.fn().mockResolvedValue(order),
    confirm: vi.fn().mockResolvedValue({ changed: opts.confirmChanged ?? true }),
    notifyOrderEvent: opts.notifyFails ? vi.fn().mockRejectedValue(new Error("notify down")) : vi.fn().mockResolvedValue(undefined),
  };
  const paymentRepository = { create: vi.fn().mockResolvedValue({}) };
  const inventoryFinalization = { finalize: opts.txFails ? vi.fn().mockRejectedValue(new Error("db down")) : vi.fn().mockResolvedValue(undefined) };
  const transaction = { run: (fn: (tx: unknown) => Promise<unknown>) => fn("tx") };
  const observability = fakeObservability();
  const useCase = new ConfirmCodOrderUseCase(orderPort as never, paymentRepository as never, inventoryFinalization as never, transaction as never, observability);
  return { useCase, observability, orderPort };
}

describe("ConfirmCodOrderUseCase — order-confirmed metric", () => {
  it("records `confirmed` exactly once when the COD confirmation actually commits", async () => {
    const { useCase, observability } = build();
    await expect(useCase.execute("o1", undefined)).resolves.toEqual({ alreadyConfirmed: false });
    expect(observability.recordOrderEvent).toHaveBeenCalledTimes(1);
    expect(observability.recordOrderEvent).toHaveBeenCalledWith({ event: "confirmed" });
  });

  it("does NOT record on an idempotent replay of an already-CONFIRMED order", async () => {
    const { useCase, observability } = build({ status: "CONFIRMED" });
    await expect(useCase.execute("o1", undefined)).resolves.toEqual({ alreadyConfirmed: true });
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("does NOT record when a concurrent confirmation won the race (transition changed nothing)", async () => {
    const { useCase, observability } = build({ confirmChanged: false });
    await expect(useCase.execute("o1", undefined)).resolves.toEqual({ alreadyConfirmed: true });
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("does NOT record when the transaction fails and rolls back", async () => {
    const { useCase, observability } = build({ txFails: true });
    await expect(useCase.execute("o1", undefined)).rejects.toThrow("db down");
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("does NOT record for a non-COD order (rejected before any transition)", async () => {
    const { useCase, observability } = build({ paymentMethod: "RAZORPAY" });
    await expect(useCase.execute("o1", undefined)).rejects.toThrow();
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("still counts a durable confirmation if the follow-up notification throws (recorded before notify)", async () => {
    const { useCase, observability } = build({ notifyFails: true });
    await expect(useCase.execute("o1", undefined)).rejects.toThrow("notify down");
    expect(observability.recordOrderEvent).toHaveBeenCalledWith({ event: "confirmed" });
  });
});
