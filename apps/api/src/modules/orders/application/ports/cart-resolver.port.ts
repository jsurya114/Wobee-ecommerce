/**
 * Narrow port for this module's dependency on `cart` — same
 * get-or-create-by-(user|guest-cookie) resolution cart's own controller
 * uses (GetOrCreateCartUseCase). A brand-new empty cart resolving here is
 * harmless: checkout immediately fails with "cart is empty" either way.
 */
export interface CartResolverPort {
  resolve(params: { userId?: string; guestCartId?: string }): Promise<{ cartId: string }>;
}
