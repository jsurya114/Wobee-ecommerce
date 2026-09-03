import type { OrderEntity } from "./entities/order.entity";

/**
 * Pure eligibility check (ARCHITECTURE.md §3.1) — client-review fix
 * (2026-09-03). An order can be claimed onto an account only while it's
 * still guest-owned (`userId === null`, never revisited once checkout sets
 * it — see ClaimGuestOrderUseCase's own doc comment) AND the caller
 * supplies the exact email it was placed under. Both sides are already
 * lowercase/trimmed by @woobe/validation's shared checkout/claim schemas
 * (ADR-020), so a plain equality check is correct without re-normalizing
 * here.
 */
export function canClaimGuestOrder(order: OrderEntity, contactEmail: string): boolean {
  return order.userId === null && order.contactEmail === contactEmail;
}
