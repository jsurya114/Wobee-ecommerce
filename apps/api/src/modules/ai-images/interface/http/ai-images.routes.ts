import { requestAiImagesSchema } from "@woobe/validation";
import { Router } from "express";
import { PERMISSIONS } from "../../../../config/permissions";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import type { AiImagesController } from "./ai-images.controller";

export function createAiImagesRouter(controller: AiImagesController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.post("/products/:productId", validate(requestAiImagesSchema), asyncHandler((req, res) => controller.request(req, res)));
  router.get("/products/:productId", asyncHandler((req, res) => controller.list(req, res)));
  router.post("/images/:id/approve", asyncHandler((req, res) => controller.approve(req, res)));
  router.post("/images/:id/reject", asyncHandler((req, res) => controller.reject(req, res)));
  router.post("/images/:id/regenerate", asyncHandler((req, res) => controller.regenerate(req, res)));

  return router;
}
