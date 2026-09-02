import { updatePricingSettingSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminSettingsController } from "./admin-settings.controller";

export function createAdminSettingsRouter(controller: AdminSettingsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_SETTINGS));

  router.get("/pricing", asyncHandler((req, res) => controller.getPricing(req, res)));
  router.put("/pricing", validate(updatePricingSettingSchema), asyncHandler((req, res) => controller.updatePricing(req, res)));

  return router;
}
