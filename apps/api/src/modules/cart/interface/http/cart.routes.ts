import { addCartItemSchema, applyCouponSchema, changeCartItemVariantSchema, updateCartItemSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { optionalAuthGuard } from "../../../../middleware/optional-auth-guard";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import type { CartController } from "./cart.controller";

// Forensic review (2026-09-13): every cart mutation route was reachable by
// an unauthenticated guest (ADR-011) with NO rate limiting at all — a
// scripted client could generate unbounded cart-mutation DB writes with
// nothing in front of it. GET /cart (read-only) is left unlimited on
// purpose — it's the one endpoint a normal page load hits repeatedly and
// carries no write cost. 120/5min comfortably covers real browsing/cart
// editing (adding several items, adjusting quantities, swapping variants)
// while bounding scripted abuse.
const CART_MUTATION_RATE_LIMIT = { max: 120, windowSeconds: 5 * 60 };

export function createCartRouter(controller: CartController): Router {
  const router = Router();

  // Guest or logged-in — optionalAuthGuard never rejects (ADR-011: same
  // endpoints serve both, distinguished by req.user's presence).
  router.get(
    "/",
    optionalAuthGuard,
    asyncHandler((req, res) => controller.getCart(req, res)),
  );
  router.post(
    "/items",
    rateLimit({ keyPrefix: "cart:items-add", ...CART_MUTATION_RATE_LIMIT }),
    optionalAuthGuard,
    validate(addCartItemSchema),
    asyncHandler((req, res) => controller.addItem(req, res)),
  );
  router.patch(
    "/items/:itemId",
    rateLimit({ keyPrefix: "cart:items-update", ...CART_MUTATION_RATE_LIMIT }),
    optionalAuthGuard,
    validate(updateCartItemSchema),
    asyncHandler((req, res) => controller.updateItem(req, res)),
  );
  router.patch(
    "/items/:itemId/variant",
    rateLimit({ keyPrefix: "cart:items-change-variant", ...CART_MUTATION_RATE_LIMIT }),
    optionalAuthGuard,
    validate(changeCartItemVariantSchema),
    asyncHandler((req, res) => controller.changeItemVariant(req, res)),
  );
  router.delete(
    "/items/:itemId",
    rateLimit({ keyPrefix: "cart:items-remove", ...CART_MUTATION_RATE_LIMIT }),
    optionalAuthGuard,
    asyncHandler((req, res) => controller.removeItem(req, res)),
  );

  // Merge requires a real login — this is the one cart endpoint that isn't guest-accessible.
  router.post(
    "/merge",
    rateLimit({ keyPrefix: "cart:merge", ...CART_MUTATION_RATE_LIMIT }),
    authGuard,
    asyncHandler((req, res) => controller.merge(req, res)),
  );

  // Coupons require a real account too (Cart.couponCode's own schema
  // comment, CouponRedemption.userId is non-null) — week2 (1).md §9.
  router.post(
    "/coupon",
    rateLimit({ keyPrefix: "cart:coupon-apply", ...CART_MUTATION_RATE_LIMIT }),
    authGuard,
    validate(applyCouponSchema),
    asyncHandler((req, res) => controller.applyCoupon(req, res)),
  );
  router.delete(
    "/coupon",
    rateLimit({ keyPrefix: "cart:coupon-remove", ...CART_MUTATION_RATE_LIMIT }),
    authGuard,
    asyncHandler((req, res) => controller.removeCoupon(req, res)),
  );

  return router;
}
