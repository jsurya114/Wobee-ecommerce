import { changeStaffRoleSchema, createStaffSchema, listStaffQuerySchema, setStaffActiveSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminStaffController } from "./admin-staff.controller";

export function createAdminStaffRouter(controller: AdminStaffController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_STAFF));

  router.get("/", validate(listStaffQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.post("/", validate(createStaffSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.patch("/:id/role", validate(changeStaffRoleSchema), asyncHandler((req, res) => controller.changeRole(req, res)));
  router.post("/:id/active", validate(setStaffActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));
  router.post("/:id/invitation/resend", asyncHandler((req, res) => controller.resendInvitation(req, res)));

  return router;
}
