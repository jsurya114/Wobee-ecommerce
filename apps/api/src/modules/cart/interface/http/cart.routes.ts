import { addCartItemSchema, updateCartItemSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { optionalAuthGuard } from "../../../../middleware/optional-auth-guard";
import { validate } from "../../../../middleware/validate";
import type { CartController } from "./cart.controller";

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
    optionalAuthGuard,
    validate(addCartItemSchema),
    asyncHandler((req, res) => controller.addItem(req, res)),
  );
  router.patch(
    "/items/:itemId",
    optionalAuthGuard,
    validate(updateCartItemSchema),
    asyncHandler((req, res) => controller.updateItem(req, res)),
  );
  router.delete(
    "/items/:itemId",
    optionalAuthGuard,
    asyncHandler((req, res) => controller.removeItem(req, res)),
  );

  // Merge requires a real login — this is the one cart endpoint that isn't guest-accessible.
  router.post(
    "/merge",
    authGuard,
    asyncHandler((req, res) => controller.merge(req, res)),
  );

  return router;
}
