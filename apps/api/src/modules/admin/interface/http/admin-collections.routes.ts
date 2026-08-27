import {
  assignCollectionProductSchema,
  createCollectionSchema,
  reorderCollectionProductsSchema,
  setCollectionActiveSchema,
  updateCollectionSchema,
} from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminCollectionsController } from "./admin-collections.controller";

export function createAdminCollectionsRouter(controller: AdminCollectionsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.get("/", asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/", validate(createCollectionSchema), asyncHandler((req, res) => controller.create(req, res)));
  router.patch("/:id", validate(updateCollectionSchema), asyncHandler((req, res) => controller.update(req, res)));
  router.post("/:id/active", validate(setCollectionActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));
  router.post("/:id/products", validate(assignCollectionProductSchema), asyncHandler((req, res) => controller.assignProduct(req, res)));
  router.delete("/:id/products/:productId", asyncHandler((req, res) => controller.removeProduct(req, res)));
  router.put(
    "/:id/products/order",
    validate(reorderCollectionProductsSchema),
    asyncHandler((req, res) => controller.reorderProducts(req, res)),
  );

  return router;
}
