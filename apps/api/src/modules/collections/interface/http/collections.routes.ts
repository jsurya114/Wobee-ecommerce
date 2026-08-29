import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import type { CollectionsController } from "./collections.controller";

export function createCollectionsRouter(controller: CollectionsController): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.get(
    "/:slug",
    asyncHandler((req, res) => controller.getBySlug(req, res)),
  );

  return router;
}
