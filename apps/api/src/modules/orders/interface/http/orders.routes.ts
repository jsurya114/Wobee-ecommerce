import { checkoutSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
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

  // "My Orders" (Day 5) — logged-in only, must come before "/:id" so it
  // isn't swallowed by the param route (Express matches by literal path
  // first regardless of registration order here, but explicit is cheap).
  router.get(
    "/",
    authGuard,
    asyncHandler((req, res) => controller.listMyOrders(req, res)),
  );

  // Order confirmation page (Day 5) — guest orders are readable by id alone
  // (GetOrderUseCase's own comment), account orders require ownership.
  router.get(
    "/:id",
    optionalAuthGuard,
    asyncHandler((req, res) => controller.getOrder(req, res)),
  );

  return router;
}
