import { productListQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { validate } from "../../../../middleware/validate";
import type { ProductsController } from "./products.controller";

export function createProductsRouter(controller: ProductsController): Router {
  const router = Router();

  router.get(
    "/",
    validate(productListQuerySchema, "query"),
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.get(
    "/:slug",
    asyncHandler((req, res) => controller.getBySlug(req, res)),
  );

  return router;
}
