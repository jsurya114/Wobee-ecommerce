import ms from "ms";
import { env } from "../../../config/env";

/**
 * Rules for the staff-invitation email code, kept pure (no env read at call
 * time beyond this module's own constant, no I/O) — same shape as auth's
 * otp.policy.ts, duplicated rather than cross-module-imported (auth's file
 * is an internal domain file, never exported via auth.module.ts; every other
 * module-to-module reach-in in this codebase goes through a `*.module.ts`'s
 * exports only). The one deliberate difference: TTL is much longer and
 * env-configurable (STAFF_INVITATION_TTL_HOURS) — an invitation email can
 * sit unread far longer than a live password-reset flow.
 */

/** Matches OtpCodeService's default length — same 4-digit code shape as every other OTP flow in this codebase. */
export const STAFF_INVITATION_CODE_LENGTH = 4;
export const STAFF_INVITATION_TTL_MS = ms(`${env.STAFF_INVITATION_TTL_HOURS}h`);
/** Minimum gap between "resend" requests for one invitation. */
export const RESEND_COOLDOWN_MS = 45 * 1000;
/** Wrong-code submissions allowed over the invitation's whole lifetime (NOT per code — survives resends). */
export const MAX_VERIFY_ATTEMPTS = 10;
/** "Resend" requests allowed before a super_admin has to look into why the invite isn't landing. */
export const MAX_RESENDS = 5;

export function isInvitationExpired(v: { expiresAt: Date }, now: Date): boolean {
  return v.expiresAt.getTime() <= now.getTime();
}

export function isInvitationConsumed(v: { consumedAt: Date | null }): boolean {
  return v.consumedAt !== null;
}

export function hasVerifyAttemptsLeft(v: { attempts: number }): boolean {
  return v.attempts < MAX_VERIFY_ATTEMPTS;
}

export function resendLimitReached(v: { resendCount: number }): boolean {
  return v.resendCount >= MAX_RESENDS;
}

/** Milliseconds still to wait before a resend is allowed (0 when it's allowed now). */
export function resendCooldownRemainingMs(v: { lastSentAt: Date }, now: Date): number {
  return Math.max(0, v.lastSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime());
}
