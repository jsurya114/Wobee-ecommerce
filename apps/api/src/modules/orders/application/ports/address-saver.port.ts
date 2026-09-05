import type { CheckoutAddressInput } from "@woobe/validation";

/**
 * `orders` depends on this abstraction, not on `users` directly (ADR-010 —
 * only `users`' own `infrastructure/` may touch the Address table; this
 * port is how `orders` reaches that behavior without a cross-module reach-in).
 *
 * Deliberately fire-and-forget shaped (`Promise<void>`, no return value) —
 * CheckoutUseCase's own doc comment on why this is called AFTER the order
 * transaction commits, and never allowed to fail checkout, is the reason:
 * there is nothing for a caller to do with a result here, only whether the
 * call itself threw (and CheckoutUseCase swallows that too).
 */
export interface AddressSaverPort {
  /**
   * Persists `address` to `userId`'s saved address book unless an
   * equivalent one already exists (see SaveCheckoutAddressUseCase's own
   * dedup rule) — never creates a duplicate, never overwrites an existing
   * entry, never throws for "already exists".
   */
  saveIfNew(userId: string, address: CheckoutAddressInput): Promise<void>;
}
