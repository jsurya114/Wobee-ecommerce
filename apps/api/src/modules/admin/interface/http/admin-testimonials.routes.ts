import { listAdminTestimonialsQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminTestimonialsController } from "./admin-testimonials.controller";

/** MANAGE_TESTIMONIALS is SUPER_ADMIN-only (config/permissions.ts) — every route here inherits that, no per-route role check needed. */
export function createAdminTestimonialsRouter(controller: AdminTestimonialsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_TESTIMONIALS));

  router.get(
    "/",
    validate(listAdminTestimonialsQuerySchema, "query"),
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.post("/:id/approve", asyncHandler((req, res) => controller.approve(req, res)));
  router.post("/:id/reject", asyncHandler((req, res) => controller.reject(req, res)));

  return router;
}
