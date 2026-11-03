import { describe, expect, it, vi } from "vitest";
import { UpdateTrackingUseCase } from "./update-tracking.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

function shipped(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return { id: "o1", status: "SHIPPED", carrier: "DTDC", carrierCode: "DTDC", trackingNumber: "OLD", trackingUrl: null, ...overrides } as OrderEntity;
}
const actor = { id: "s1", role: "ORDER_PROCESSING_STAFF" } as const;

describe("UpdateTrackingUseCase", () => {
  it("rewrites tracking, audits it, and re-sends with a fresh dedupe version", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(shipped()), updateTracking: vi.fn().mockResolvedValue({ changed: true, order: shipped({ trackingNumber: "NEW" }) }) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const notify = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new UpdateTrackingUseCase(orderRepository, auditLogger, notify, () => new Date(1700000000000));

    await useCase.execute("o1", actor, { trackingNumber: " NEW ", carrierCode: "EKART", resend: true });

    expect(orderRepository.updateTracking).toHaveBeenCalledWith("o1", expect.objectContaining({ trackingNumber: "NEW", carrier: "Ekart Logistics", carrierCode: "EKART" }));
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "ORDER_TRACKING_UPDATED" }));
    expect(notify.execute).toHaveBeenCalledWith("o1", "ORDER_SHIPPED", { dedupeVersion: "1700000000000" });
  });

  it("does not email when resend is false", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(shipped()), updateTracking: vi.fn().mockResolvedValue({ changed: true, order: shipped() }) } as unknown as OrderRepositoryPort;
    const notify = { execute: vi.fn() };
    await new UpdateTrackingUseCase(orderRepository, { log: vi.fn() }, notify).execute("o1", actor, { trackingNumber: "N", carrierCode: "DTDC", resend: false });
    expect(notify.execute).not.toHaveBeenCalled();
  });

  it("refuses an order that is not shipped", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(shipped({ status: "DELIVERED" })) } as unknown as OrderRepositoryPort;
    await expect(
      new UpdateTrackingUseCase(orderRepository, { log: vi.fn() }, { execute: vi.fn() }).execute("o1", actor, { trackingNumber: "N", carrierCode: "DTDC", resend: true }),
    ).rejects.toThrow("only be changed on a shipped order");
  });
});
