import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import type { BannersController } from "./banners.controller";

export function createBannersRouter(controller: BannersController): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((req, res) => controller.list(req, res)),
  );

  return router;
}
