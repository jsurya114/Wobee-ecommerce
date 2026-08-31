import { createBannerSchema, reorderBannersSchema, setBannerActiveSchema, updateBannerSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminBannersController } from "./admin-banners.controller";

export function createAdminBannersRouter(controller: AdminBannersController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createBannerSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateBannerSchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setBannerActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));
  router.put("/order", validate(reorderBannersSchema), asyncHandler((req, res) => controller.reorder(req, res)));
  router.delete("/:id", asyncHandler((req, res) => controller.remove(req, res)));

  return router;
}
