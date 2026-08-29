import { adjustInventorySchema, listInventoryAdminQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminInventoryController } from "./admin-inventory.controller";

export function createAdminInventoryRouter(controller: AdminInventoryController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_INVENTORY));

  router.get("/", validate(listInventoryAdminQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.post("/:variantId/adjust", validate(adjustInventorySchema), asyncHandler((req, res) => controller.adjust(req, res)));

  return router;
}
