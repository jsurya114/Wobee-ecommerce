import { adminDashboardQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminAnalyticsController } from "./admin-analytics.controller";

export function createAdminAnalyticsRouter(controller: AdminAnalyticsController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.VIEW_ANALYTICS));

  router.get("/dashboard", validate(adminDashboardQuerySchema, "query"), asyncHandler((req, res) => controller.getDashboard(req, res)));

  return router;
}
