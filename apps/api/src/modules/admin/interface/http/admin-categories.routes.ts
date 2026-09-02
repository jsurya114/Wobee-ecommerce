import { createCategorySchema, reorderCategoriesSchema, setCategoryActiveSchema, updateCategorySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminCategoriesController } from "./admin-categories.controller";

export function createAdminCategoriesRouter(controller: AdminCategoriesController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createCategorySchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateCategorySchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setCategoryActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));
  router.put("/order", validate(reorderCategoriesSchema), asyncHandler((req, res) => controller.reorder(req, res)));

  return router;
}
