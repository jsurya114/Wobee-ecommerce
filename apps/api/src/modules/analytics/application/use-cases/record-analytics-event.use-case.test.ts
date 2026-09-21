import { describe, expect, it, vi } from "vitest";
import { RecordAnalyticsEventUseCase } from "./record-analytics-event.use-case";

const SESSION = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";

describe("RecordAnalyticsEventUseCase", () => {
  it("once-per-session events use a fixed dedupe key and carry no product", async () => {
    const record = vi.fn().mockResolvedValue(true);
    const uc = new RecordAnalyticsEventUseCase({ record });
    for (const type of ["SESSION_STARTED", "CART_ADDED", "CHECKOUT_STARTED"] as const) {
      await uc.execute({ type, sessionId: SESSION }, null);
    }
    expect(record.mock.calls.map((c) => c[0])).toEqual([
      { type: "SESSION_STARTED", sessionId: SESSION, dedupeKey: "once", productId: null, userId: null },
      { type: "CART_ADDED", sessionId: SESSION, dedupeKey: "once", productId: null, userId: null },
      { type: "CHECKOUT_STARTED", sessionId: SESSION, dedupeKey: "once", productId: null, userId: null },
    ]);
  });

  it("product views dedupe per product, so a session viewing two products records two rows", async () => {
    const record = vi.fn().mockResolvedValue(true);
    await new RecordAnalyticsEventUseCase({ record }).execute({ type: "PRODUCT_VIEWED", sessionId: SESSION, productId: PRODUCT }, "user-1");
    expect(record).toHaveBeenCalledWith({ type: "PRODUCT_VIEWED", sessionId: SESSION, dedupeKey: PRODUCT, productId: PRODUCT, userId: "user-1" });
  });

  it("reports whether a new row was written (duplicates are no-ops, not errors)", async () => {
    const record = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const uc = new RecordAnalyticsEventUseCase({ record });
    expect(await uc.execute({ type: "SESSION_STARTED", sessionId: SESSION }, null)).toEqual({ recorded: true });
    expect(await uc.execute({ type: "SESSION_STARTED", sessionId: SESSION }, null)).toEqual({ recorded: false });
  });
});
