import { checkoutSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { optionalAuthGuard } from "../../../../middleware/optional-auth-guard";
import { validate } from "../../../../middleware/validate";
import type { OrdersController } from "./orders.controller";

export function createOrdersRouter(controller: OrdersController): Router {
  const router = Router();

  // Guest or logged-in (week1_excecution_prompt.md Day 4) — same
  // optionalAuthGuard pattern cart's own routes use (ADR-011).
  router.post(
    "/checkout",
    optionalAuthGuard,
    validate(checkoutSchema),
    asyncHandler((req, res) => controller.checkout(req, res)),
  );

  return router;
}
