import {
  addProductImageSchema,
  createProductSchema,
  createVariantSchema,
  listProductsAdminQuerySchema,
  reorderProductImagesSchema,
  setProductActiveSchema,
  setVariantActiveSchema,
  updateProductSchema,
  updateVariantSchema,
} from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminProductsController } from "./admin-products.controller";

export function createAdminProductsRouter(controller: AdminProductsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", validate(listProductsAdminQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createProductSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateProductSchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setProductActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));

  router.post("/:id/variants", validate(createVariantSchema), asyncHandler((req, res) => controller.createVariant(req, res)));
  router.patch("/:id/variants/:variantId", validate(updateVariantSchema), asyncHandler((req, res) => controller.updateVariant(req, res)));
  router.post(
    "/:id/variants/:variantId/active",
    validate(setVariantActiveSchema),
    asyncHandler((req, res) => controller.setVariantActive(req, res)),
  );

  router.post("/:id/images", validate(addProductImageSchema), asyncHandler((req, res) => controller.addImage(req, res)));
  router.delete("/:id/images/:imageId", asyncHandler((req, res) => controller.removeImage(req, res)));
  router.put(
    "/:id/images/order",
    validate(reorderProductImagesSchema),
    asyncHandler((req, res) => controller.reorderImages(req, res)),
  );

  return router;
}
