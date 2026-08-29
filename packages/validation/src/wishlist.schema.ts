import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the wishlist request shapes — used
 * by apps/web's PLP/PDP "save" affordance and apps/api's `validate`
 * middleware. `variantId` is optional: a shopper can save "the product"
 * without committing to a size (see wishlist.module.ts's own doc comment
 * on how that affects move-to-cart).
 */

export const addWishlistItemSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  variantId: z.string().uuid("Invalid variant id").optional(),
});
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;

// Mirrors addCartItemSchema's cap (packages/validation/src/cart.schema.ts) — moving a
// wishlist item into the cart is still adding a cart item under the hood.
export const moveWishlistItemToCartSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity cannot exceed 20").default(1),
});
export type MoveWishlistItemToCartInput = z.infer<typeof moveWishlistItemToCartSchema>;
