import { addWishlistItemSchema, moveWishlistItemToCartSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { WishlistController } from "./wishlist.controller";

/** Every route requires a real login (week2 (1).md §5: "Authentication as required" — Wishlist.userId is non-null/unique, no guest wishlist, full stop) — unlike cart's optionalAuthGuard. */
export function createWishlistRouter(controller: WishlistController): Router {
  const router = Router();
  router.use(authGuard);

  router.get("/", asyncHandler((req, res) => controller.getWishlist(req, res)));
  router.post("/items", validate(addWishlistItemSchema), asyncHandler((req, res) => controller.addItem(req, res)));
  router.delete("/items/:itemId", asyncHandler((req, res) => controller.removeItem(req, res)));
  router.get("/state/:productId", asyncHandler((req, res) => controller.checkState(req, res)));
  router.post(
    "/items/:itemId/move-to-cart",
    validate(moveWishlistItemToCartSchema),
    asyncHandler((req, res) => controller.moveToCart(req, res)),
  );

  return router;
}
