/**
 * Delivers a freshly generated registration OTP. A dedicated port for the
 * auth module — deliberately NOT the notifications/BullMQ pipeline, which
 * is async-only and has a no-op email provider. The concrete adapter is
 * chosen in auth.module.ts; swapping DevOtpNotifier for a real SES/SendGrid
 * one is a one-line change and touches nothing else.
 *
 * Contract: resolve on delivery, throw on failure (a thrown error fails the
 * HTTP request rather than silently minting an undeliverable code).
 */
export interface OtpNotifierPort {
  sendRegistrationOtp(params: { email: string; code: string; expiresAt: Date }): Promise<void>;
}
