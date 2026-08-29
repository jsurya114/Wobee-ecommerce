import { listAdminReviewsQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminReviewsController } from "./admin-reviews.controller";

export function createAdminReviewsRouter(controller: AdminReviewsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get(
    "/",
    validate(listAdminReviewsQuerySchema, "query"),
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.post("/:id/approve", asyncHandler((req, res) => controller.approve(req, res)));
  router.post("/:id/reject", asyncHandler((req, res) => controller.reject(req, res)));
  router.post("/:id/hide", asyncHandler((req, res) => controller.hide(req, res)));

  return router;
}
