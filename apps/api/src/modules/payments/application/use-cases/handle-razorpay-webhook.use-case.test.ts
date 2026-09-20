import { describe, expect, it, vi } from "vitest";
import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
import { ConflictError } from "../../../../shared/errors";
import { WebhookEventAlreadyExistsError } from "../../domain/errors/webhook-event-already-exists.error";
import { HandleRazorpayWebhookUseCase } from "./handle-razorpay-webhook.use-case";

function fakeObservability(): ObservabilityPort {
  return { recordOrderCreated: vi.fn(), recordOrderEvent: vi.fn(), recordRefundIssued: vi.fn(), recordInventoryReservation: vi.fn(), recordPaymentWebhook: vi.fn() };
}

interface Opts {
  signatureValid?: boolean;
  existingProcessed?: boolean;
  createRaces?: boolean;
  hasPaymentEntity?: boolean;
  knownOrder?: boolean;
  amount?: number;
  transitionChanged?: boolean;
  transitionThrows?: Error;
  notifyFails?: boolean;
}

function build(o: Opts = {}) {
  const gateway = { verifyWebhookSignature: vi.fn().mockReturnValue(o.signatureValid ?? true) };
  const webhookEventRepository = {
    findByProviderAndEventId: vi
      .fn()
      .mockResolvedValueOnce(o.existingProcessed ? { id: "we1", processedAt: new Date() } : null)
      .mockResolvedValue(o.createRaces ? { id: "we1", processedAt: new Date() } : null),
    create: o.createRaces ? vi.fn().mockRejectedValue(new WebhookEventAlreadyExistsError()) : vi.fn().mockResolvedValue({ id: "we1" }),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  };
  const paymentRepository = {
    findByRazorpayOrderId: vi.fn().mockResolvedValue(o.knownOrder === false ? null : { id: "p1", orderId: "o1", amountPaise: 1000 }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const transition = o.transitionThrows ? vi.fn().mockRejectedValue(o.transitionThrows) : vi.fn().mockResolvedValue({ changed: o.transitionChanged ?? true });
  const callOrder: string[] = [];
  const orderPort = {
    getOrder: vi.fn().mockResolvedValue({ id: "o1", items: [] }),
    confirm: transition,
    markPaymentFailed: transition,
    notifyOrderEvent: vi.fn().mockImplementation(async () => {
      callOrder.push("notify");
      if (o.notifyFails) throw new Error("notify down");
    }),
  };
  const inventoryFinalization = { finalize: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const transaction = { run: (fn: (tx: unknown) => Promise<unknown>) => fn("tx") };
  const observability = fakeObservability();
  (observability.recordOrderEvent as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push("record"));
  const useCase = new HandleRazorpayWebhookUseCase(gateway as never, webhookEventRepository as never, paymentRepository as never, orderPort as never, inventoryFinalization as never, transaction as never, observability);

  const run = (event = "payment.captured") =>
    useCase.execute({
      rawBody: "{}",
      signature: "sig",
      eventId: "evt1",
      payload: { event, payload: o.hasPaymentEntity === false ? {} : { payment: { entity: { id: "pay1", order_id: "rzp_o1", amount: o.amount ?? 1000, status: "x" } } } },
    });
  return { run, observability, callOrder };
}

const webhookCall = (obs: ObservabilityPort) => (obs.recordPaymentWebhook as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);

describe("HandleRazorpayWebhookUseCase — metrics", () => {
  it("payment.captured: records the webhook as processed AND one confirmed order transition", async () => {
    const { run, observability } = build();
    await run("payment.captured");
    expect(observability.recordOrderEvent).toHaveBeenCalledTimes(1);
    expect(observability.recordOrderEvent).toHaveBeenCalledWith({ event: "confirmed" });
    const calls = webhookCall(observability);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ eventType: "payment.captured", result: "processed" });
    expect(calls[0].durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("payment.failed: records payment_failed once", async () => {
    const { run, observability } = build();
    await run("payment.failed");
    expect(observability.recordOrderEvent).toHaveBeenCalledWith({ event: "payment_failed" });
    expect(observability.recordOrderEvent).toHaveBeenCalledTimes(1);
  });

  it("a replayed delivery (already processed) is `deduped` and records NO order transition", async () => {
    const { run, observability } = build({ existingProcessed: true });
    await run();
    expect(webhookCall(observability)).toEqual([expect.objectContaining({ result: "deduped" })]);
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("losing the dedup-row race to an already-finished winner is `deduped`, no order transition", async () => {
    const { run, observability } = build({ createRaces: true });
    await run();
    expect(webhookCall(observability)).toEqual([expect.objectContaining({ result: "deduped" })]);
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("a different delivery for an order that is ALREADY confirmed (changed:false) records no confirmed transition", async () => {
    const { run, observability } = build({ transitionChanged: false });
    await run("payment.captured");
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
    expect(webhookCall(observability)).toEqual([expect.objectContaining({ result: "processed" })]);
  });

  it("amount mismatch: result `amount-mismatch`, order NOT confirmed", async () => {
    const { run, observability } = build({ amount: 999 });
    await run("payment.captured");
    expect(webhookCall(observability)).toEqual([expect.objectContaining({ result: "amount-mismatch" })]);
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("out-of-order event (ConflictError): result `stale`, no order transition", async () => {
    const { run, observability } = build({ transitionThrows: new ConflictError("already failed") });
    await run("payment.captured");
    expect(webhookCall(observability)).toEqual([expect.objectContaining({ result: "stale" })]);
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("an event with no payment entity, or for an unknown order, is `ignored`", async () => {
    const a = build({ hasPaymentEntity: false });
    await a.run("subscription.charged");
    expect(webhookCall(a.observability)).toEqual([expect.objectContaining({ eventType: "subscription.charged", result: "ignored" })]);

    const b = build({ knownOrder: false });
    await b.run();
    expect(webhookCall(b.observability)).toEqual([expect.objectContaining({ result: "ignored" })]);
    expect(b.observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("an invalid signature records NOTHING (an unauthenticated caller must not be able to write metrics)", async () => {
    const { run, observability } = build({ signatureValid: false });
    await expect(run()).rejects.toThrow();
    expect(observability.recordPaymentWebhook).not.toHaveBeenCalled();
    expect(observability.recordOrderEvent).not.toHaveBeenCalled();
  });

  it("records the confirmation BEFORE notifying, so a throwing notification cannot erase a durable transition from the metric", async () => {
    const { run, observability, callOrder } = build({ notifyFails: true });
    await expect(run("payment.captured")).rejects.toThrow("notify down");
    expect(callOrder).toEqual(["record", "notify"]);
    expect(observability.recordOrderEvent).toHaveBeenCalledWith({ event: "confirmed" });
  });
});
