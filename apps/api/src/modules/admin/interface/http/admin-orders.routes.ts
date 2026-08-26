import { cancelOrderSchema, listOrdersQuerySchema, shipOrderSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminOrdersController } from "./admin-orders.controller";

export function createAdminOrdersRouter(controller: AdminOrdersController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_ORDERS));

  router.get("/", validate(listOrdersQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/:id/processing", asyncHandler((req, res) => controller.startProcessing(req, res)));
  router.post("/:id/ship", validate(shipOrderSchema), asyncHandler((req, res) => controller.ship(req, res)));
  router.post("/:id/deliver", asyncHandler((req, res) => controller.deliver(req, res)));
  router.post("/:id/cancel", validate(cancelOrderSchema), asyncHandler((req, res) => controller.cancel(req, res)));

  return router;
}
