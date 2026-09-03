import { createCouponSchema, setCouponActiveSchema, updateCouponSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminCouponsController } from "./admin-coupons.controller";

/** MANAGE_CATALOG — same merchandising-surface permission banners/categories/collections already use (coupons are a marketing/pricing tool, not a distinct concern). */
export function createAdminCouponsRouter(controller: AdminCouponsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createCouponSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateCouponSchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setCouponActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));
  router.delete("/:id", asyncHandler((req, res) => controller.remove(req, res)));

  return router;
}
