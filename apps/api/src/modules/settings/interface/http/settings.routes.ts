import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import type { SettingsController } from "./settings.controller";

export function createSettingsRouter(controller: SettingsController): Router {
  const router = Router();
  // Public, unauthenticated — see GetPublicAppConfigUseCase for why that's safe.
  router.get("/config/public", asyncHandler((req, res) => controller.getPublicConfig(req, res)));
  return router;
}
