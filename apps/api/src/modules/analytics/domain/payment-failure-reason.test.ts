import { describe, expect, it } from "vitest";
import { PAYMENT_FAILURE_REASONS, normalizePaymentFailure } from "./payment-failure-reason";

describe("normalizePaymentFailure", () => {
  it.each([
    [{ reason: "insufficient_funds" }, "insufficient_funds"],
    [{ description: "Payment failed due to insufficient balance in your account" }, "insufficient_funds"],
    [{ reason: "payment_cancelled", description: "Payment processing cancelled by user" }, "cancelled"],
    [{ code: "BAD_REQUEST_ERROR", reason: "authentication_failed", description: "Payment failed because 3DS authentication failed" }, "authentication_failed"],
    [{ description: "Incorrect OTP entered" }, "authentication_failed"],
    [{ description: "The payment timed out" }, "timeout"],
    [{ reason: "payment_expired" }, "expired"],
    [{ description: "Payment declined by the issuing bank" }, "declined"],
    [{ description: "Your bank could not process the payment: gateway error" }, "network_error"],
    [{ code: "GATEWAY_ERROR" }, "network_error"],
    [{ reason: "input_validation_failed", description: "Invalid card number" }, "invalid_request"],
  ] as const)("maps %j -> %s", (raw, expected) => {
    expect(normalizePaymentFailure(raw)).toBe(expected);
  });

  it("falls back to unknown for empty, nullish or unrecognised input", () => {
    expect(normalizePaymentFailure({})).toBe("unknown");
    expect(normalizePaymentFailure({ code: null, reason: null, description: null })).toBe("unknown");
    expect(normalizePaymentFailure({ reason: "   " })).toBe("unknown");
    expect(normalizePaymentFailure({ reason: "some_brand_new_razorpay_reason_xyz" })).toBe("unknown");
  });

  it("insufficient funds outranks the generic 'declined' wording", () => {
    expect(normalizePaymentFailure({ description: "Declined: insufficient funds" })).toBe("insufficient_funds");
  });

  it("only ever returns a member of the bounded set", () => {
    const samples = ["", "x", "declined", "timeout", "??", "cancel", "network", "otp", "expire", "invalid", "zzz"];
    for (const s of samples) expect(PAYMENT_FAILURE_REASONS).toContain(normalizePaymentFailure({ reason: s }));
  });
});
