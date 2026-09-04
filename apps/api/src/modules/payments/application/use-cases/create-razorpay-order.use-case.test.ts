import { describe, expect, it, vi } from "vitest";
import { PaymentAlreadyExistsForOrderError } from "../../domain/errors/payment-already-exists-for-order.error";
import type { PaymentEntity } from "../../domain/entities/payment.entity";
import type { OrderForPayment, OrderPort } from "../ports/order-port";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";
import type { RazorpayGatewayPort } from "../ports/razorpay-gateway.port";
import { CreateRazorpayOrderUseCase } from "./create-razorpay-order.use-case";

vi.mock("../../../../config/env", () => ({ env: { RAZORPAY_KEY_ID: "test_key_id" } }));

function order(overrides: Partial<OrderForPayment> = {}): OrderForPayment {
  return {
    id: "order-1",
    orderNumber: "WOOBE-20260904-ABC123",
    userId: "user-1",
    status: "PENDING_PAYMENT",
    paymentMethod: "RAZORPAY",
    totalPaise: 10000,
    items: [],
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentEntity> = {}): PaymentEntity {
  return {
    id: "payment-1",
    orderId: "order-1",
    provider: "RAZORPAY",
    status: "CREATED",
    amountPaise: 10000,
    razorpayOrderId: "rzp_order_existing",
    razorpayPaymentId: null,
    razorpaySignature: null,
    ...overrides,
  };
}

function buildUseCase(params: {
  existingPayment?: PaymentEntity | null;
  createResult?: PaymentEntity | (() => never);
  winnerAfterRace?: PaymentEntity | null;
}) {
  const orderPort = { getOrder: vi.fn().mockResolvedValue(order()) } as unknown as OrderPort;
  const gateway = {
    createOrder: vi.fn().mockResolvedValue({ id: "rzp_order_new", amountPaise: 10000, currency: "INR" }),
  } as unknown as RazorpayGatewayPort;

  const findByOrderId = vi.fn();
  findByOrderId.mockResolvedValueOnce(params.existingPayment ?? null); // the pre-check call
  if (params.winnerAfterRace !== undefined) {
    findByOrderId.mockResolvedValueOnce(params.winnerAfterRace); // the post-race re-fetch
  }

  const create =
    typeof params.createResult === "function"
      ? vi.fn().mockRejectedValue(new PaymentAlreadyExistsForOrderError())
      : vi.fn().mockResolvedValue(params.createResult ?? payment());

  const paymentRepository = { findByOrderId, create } as unknown as PaymentRepositoryPort;

  return { useCase: new CreateRazorpayOrderUseCase(orderPort, paymentRepository, gateway), gateway, paymentRepository };
}

describe("CreateRazorpayOrderUseCase", () => {
  it("creates a new Razorpay order and Payment row when none exists yet", async () => {
    const { useCase, gateway, paymentRepository } = buildUseCase({ existingPayment: null, createResult: payment({ razorpayOrderId: "rzp_order_new" }) });
    const result = await useCase.execute("order-1", "user-1");
    expect(gateway.createOrder).toHaveBeenCalledOnce();
    expect(paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", provider: "RAZORPAY", razorpayOrderId: "rzp_order_new" }),
    );
    expect(result.razorpayOrderId).toBe("rzp_order_new");
  });

  it("is idempotent on a plain repeat call — returns the existing payment's razorpayOrderId without calling the gateway again", async () => {
    const { useCase, gateway } = buildUseCase({ existingPayment: payment({ razorpayOrderId: "rzp_order_existing" }) });
    const result = await useCase.execute("order-1", "user-1");
    expect(gateway.createOrder).not.toHaveBeenCalled();
    expect(result.razorpayOrderId).toBe("rzp_order_existing");
  });

  it("Week 3 Day 4: when two concurrent calls race and this one loses (create() throws PaymentAlreadyExistsForOrderError), defers to the winner's already-persisted razorpayOrderId instead of erroring", async () => {
    const { useCase, gateway } = buildUseCase({
      existingPayment: null, // pre-check sees nothing yet — both racers reach this point
      createResult: () => {
        throw new Error("unused");
      }, // signals "make create() reject with PaymentAlreadyExistsForOrderError"
      winnerAfterRace: payment({ razorpayOrderId: "rzp_order_winner" }),
    });

    const result = await useCase.execute("order-1", "user-1");

    // We still called the gateway once (our own now-discarded attempt) —
    // that's the accepted, documented cost of closing this race without
    // holding a DB transaction open across the external call.
    expect(gateway.createOrder).toHaveBeenCalledOnce();
    // But the caller gets back the WINNER's razorpayOrderId, not our own
    // discarded one — exactly one payment setup is ever presented to the client.
    expect(result.razorpayOrderId).toBe("rzp_order_winner");
  });

  it("fails deterministically (ConflictError) if it loses the race and the winner's row somehow has no razorpayOrderId yet", async () => {
    const { useCase } = buildUseCase({
      existingPayment: null,
      createResult: () => {
        throw new Error("unused");
      },
      winnerAfterRace: payment({ razorpayOrderId: null }),
    });

    await expect(useCase.execute("order-1", "user-1")).rejects.toThrow(/already in progress/i);
  });

  it("rejects starting payment for an order that isn't PENDING_PAYMENT", async () => {
    const orderPort = { getOrder: vi.fn().mockResolvedValue(order({ status: "CONFIRMED" })) } as unknown as OrderPort;
    const gateway = { createOrder: vi.fn() } as unknown as RazorpayGatewayPort;
    const paymentRepository = { findByOrderId: vi.fn(), create: vi.fn() } as unknown as PaymentRepositoryPort;
    const useCase = new CreateRazorpayOrderUseCase(orderPort, paymentRepository, gateway);

    await expect(useCase.execute("order-1", "user-1")).rejects.toThrow(/Cannot start payment/);
    expect(gateway.createOrder).not.toHaveBeenCalled();
  });

  it("404s (not-found, ownership-hiding) when the order belongs to a different user", async () => {
    const orderPort = { getOrder: vi.fn().mockResolvedValue(order({ userId: "someone-else" })) } as unknown as OrderPort;
    const gateway = { createOrder: vi.fn() } as unknown as RazorpayGatewayPort;
    const paymentRepository = { findByOrderId: vi.fn(), create: vi.fn() } as unknown as PaymentRepositoryPort;
    const useCase = new CreateRazorpayOrderUseCase(orderPort, paymentRepository, gateway);

    await expect(useCase.execute("order-1", "user-1")).rejects.toThrow(/not found/i);
  });
});
