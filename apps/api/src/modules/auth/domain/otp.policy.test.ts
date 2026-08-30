import { describe, expect, it } from "vitest";
import {
  hasVerifyAttemptsLeft,
  isOtpConsumed,
  isOtpExpired,
  MAX_RESENDS,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  resendLimitReached,
} from "./otp.policy";

describe("otp.policy", () => {
  it("isOtpExpired — inclusive at the boundary", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isOtpExpired({ expiresAt: new Date("2026-01-01T00:00:01Z") }, now)).toBe(false);
    expect(isOtpExpired({ expiresAt: now }, now)).toBe(true);
    expect(isOtpExpired({ expiresAt: new Date("2025-12-31T23:59:59Z") }, now)).toBe(true);
  });

  it("isOtpConsumed", () => {
    expect(isOtpConsumed({ consumedAt: null })).toBe(false);
    expect(isOtpConsumed({ consumedAt: new Date() })).toBe(true);
  });

  it("hasVerifyAttemptsLeft — boundary at MAX_VERIFY_ATTEMPTS", () => {
    expect(hasVerifyAttemptsLeft({ attempts: MAX_VERIFY_ATTEMPTS - 1 })).toBe(true);
    expect(hasVerifyAttemptsLeft({ attempts: MAX_VERIFY_ATTEMPTS })).toBe(false);
  });

  it("resendLimitReached — boundary at MAX_RESENDS", () => {
    expect(resendLimitReached({ resendCount: MAX_RESENDS - 1 })).toBe(false);
    expect(resendLimitReached({ resendCount: MAX_RESENDS })).toBe(true);
  });

  it("resendCooldownRemainingMs — 0 once the window has passed", () => {
    const now = new Date("2026-01-01T00:01:00Z");
    expect(resendCooldownRemainingMs({ lastSentAt: new Date(now.getTime() - RESEND_COOLDOWN_MS) }, now)).toBe(0);
    expect(resendCooldownRemainingMs({ lastSentAt: new Date(now.getTime() - RESEND_COOLDOWN_MS - 5000) }, now)).toBe(0);
    expect(resendCooldownRemainingMs({ lastSentAt: new Date(now.getTime() - 10_000) }, now)).toBe(
      RESEND_COOLDOWN_MS - 10_000,
    );
  });
});
