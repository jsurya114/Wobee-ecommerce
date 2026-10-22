import { updateAppConfigSchema, updatePricingSettingSchema, updateShippingRuleSchema } from "@woobe/validation";
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

  // 2026-09-28 — store settings (AppConfig) and cart/shipping rules (ShippingRule).
  router.get("/config", asyncHandler((req, res) => controller.getConfig(req, res)));
  router.patch("/config", validate(updateAppConfigSchema), asyncHandler((req, res) => controller.updateConfig(req, res)));
  router.get("/shipping", asyncHandler((req, res) => controller.getShippingRule(req, res)));
  router.patch("/shipping", validate(updateShippingRuleSchema), asyncHandler((req, res) => controller.updateShippingRule(req, res)));

  return router;
}
