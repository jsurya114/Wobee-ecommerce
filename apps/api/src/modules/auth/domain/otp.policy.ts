/**
 * Rules for the registration email-OTP, kept pure (no env, no I/O) so they
 * can be unit-tested and reused by every OTP use-case. Timings are fixed
 * product decisions, not env-configurable.
 */

/**
 * Digits in the code. Kept in sync with `@woobe/validation`'s
 * `OTP_CODE_LENGTH` (which drives the request schema + web input); a literal
 * here keeps this module dependency-free.
 *
 * SECURITY: 4 digits = 10,000 combinations. That's only safe because
 * `MAX_VERIFY_ATTEMPTS` is a HARD LIFETIME cap for a pending registration —
 * neither a `resend` nor a re-submitted `start` resets `attempts` while a
 * live (unexpired, unconsumed) row exists (see StartRegistrationUseCase /
 * ResendRegistrationOtpUseCase). After the cap the row is dead until it
 * expires; a fresh start is only allowed once the old code has expired.
 * A per-IP / per-email-per-hour limiter is still an open gap (no rate
 * limiting anywhere in this API yet — journal.md). 6 digits would be
 * strictly stronger if that ever matters more than the shorter code.
 */
export const OTP_LENGTH = 4;
/** A code is good for 5 minutes from when it was (re)sent. */
export const OTP_TTL_MS = 5 * 60 * 1000;
/** Minimum gap between "resend" requests for one pending registration. */
export const RESEND_COOLDOWN_MS = 45 * 1000;
/** Wrong-code submissions allowed over a pending registration's whole lifetime (NOT per code — survives resends and re-starts). */
export const MAX_VERIFY_ATTEMPTS = 10;
/** "Resend" requests allowed before the visitor must start over. */
export const MAX_RESENDS = 5;

export function isOtpExpired(v: { expiresAt: Date }, now: Date): boolean {
  return v.expiresAt.getTime() <= now.getTime();
}

export function isOtpConsumed(v: { consumedAt: Date | null }): boolean {
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
