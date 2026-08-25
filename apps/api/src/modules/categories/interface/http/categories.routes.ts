import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import type { CategoriesController } from "./categories.controller";

export function createCategoriesRouter(controller: CategoriesController): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((req, res) => controller.list(req, res)),
  );

  return router;
}
