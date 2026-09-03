/**
 * Pure domain function (ARCHITECTURE.md §3.1) — client-review fix
 * (2026-09-03). A guest order's `contactEmail` is the only thread back to
 * an account the guest may later create or already hold (see this
 * module's ClaimGuestOrderUseCase), so a mistyped guest email is
 * unrecoverable in a way a mistyped address isn't. Guests re-enter it;
 * this is the actual gate — enforced here, not just in the browser, so a
 * client that skips the confirmation field (or a direct API call) can't
 * bypass it. A logged-in checkout's email comes from the account already
 * and never needs re-entry, hence the early `true` below.
 */
export function isGuestCheckoutEmailConfirmed(params: {
  isGuest: boolean;
  contactEmail: string;
  confirmEmail: string | undefined;
}): boolean {
  if (!params.isGuest) return true;
  return params.confirmEmail !== undefined && params.confirmEmail === params.contactEmail;
}
