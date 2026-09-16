import { createOfferSchema, setOfferActiveSchema, updateOfferSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminOffersController } from "./admin-offers.controller";

/** MANAGE_CATALOG — same merchandising-surface permission coupons/banners/categories/collections already use (an offer is a pricing/marketing tool, not a distinct concern). */
export function createAdminOffersRouter(controller: AdminOffersController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createOfferSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateOfferSchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setOfferActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));

  return router;
}
