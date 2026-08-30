/**
 * Delivers a freshly generated forgot-password OTP. A sibling of
 * OtpNotifierPort (registration) — a separate port so the two emails can
 * have their own copy without one flow's wording leaking into the other,
 * and so the concrete adapter is chosen independently in auth.module.ts.
 *
 * Contract: resolve on delivery, throw on failure (a thrown error fails the
 * HTTP request rather than silently minting an undeliverable code).
 */
export interface PasswordResetNotifierPort {
  sendPasswordResetOtp(params: { email: string; code: string; expiresAt: Date }): Promise<void>;
}
