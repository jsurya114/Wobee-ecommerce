/**
 * Pure domain function (ARCHITECTURE.md §3.1). ADR-011: merging a guest
 * cart into an account cart on login takes the HIGHER quantity per variant
 * on conflict, not the sum — "I added 2 as a guest, then 2 again after
 * logging in on another device" shouldn't silently become 4.
 */
export function resolveMergedQuantity(accountQuantity: number, guestQuantity: number): number {
  return Math.max(accountQuantity, guestQuantity);
}
