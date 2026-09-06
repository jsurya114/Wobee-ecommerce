/**
 * Delivers a freshly generated staff-invitation code. A sibling of auth's
 * OtpNotifierPort/PasswordResetNotifierPort — same "one port per distinct
 * email, own copy, chosen independently in the module's composition root"
 * pattern (see PasswordResetNotifierPort's own comment for why one flow's
 * wording must not leak into another's): a brand-new staff account being
 * invited is a different message than "you asked to reset your password",
 * even though the underlying code/expiry mechanics are identical.
 *
 * Contract: resolve on delivery, throw on failure (a thrown error fails the
 * HTTP request rather than silently minting an undeliverable code).
 */
export interface StaffInvitationNotifierPort {
  sendStaffInvitation(params: { email: string; name: string; code: string; expiresAt: Date }): Promise<void>;
}
