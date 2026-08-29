import { listReturnsQuerySchema, rejectReturnSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminReturnsController } from "./admin-returns.controller";

/** MANAGE_ORDERS gates this the same as admin-orders — its own doc comment already names "returns/refunds" as part of that permission's scope. */
export function createAdminReturnsRouter(controller: AdminReturnsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_ORDERS));

  router.get("/", validate(listReturnsQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/:id/approve", asyncHandler((req, res) => controller.approve(req, res)));
  router.post("/:id/reject", validate(rejectReturnSchema), asyncHandler((req, res) => controller.reject(req, res)));
  router.post("/:id/refund", asyncHandler((req, res) => controller.refund(req, res)));
  router.post("/:id/mark-refunded", asyncHandler((req, res) => controller.markRefunded(req, res)));

  return router;
}
