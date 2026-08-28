import { listCustomersQuerySchema, setCustomerActiveSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminCustomersController } from "./admin-customers.controller";

export function createAdminCustomersRouter(controller: AdminCustomersController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CUSTOMERS));

  router.get("/", validate(listCustomersQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/:id/active", validate(setCustomerActiveSchema), asyncHandler((req, res) => controller.setActive(req, res)));

  return router;
}
