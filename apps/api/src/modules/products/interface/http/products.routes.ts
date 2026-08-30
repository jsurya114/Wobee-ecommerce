import { productListQuerySchema, productSuggestionQuerySchema } from "@woobe/validation";
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
  // Registered before `/:slug` so the literal path wins over the slug param.
  router.get(
    "/suggestions",
    validate(productSuggestionQuerySchema, "query"),
    asyncHandler((req, res) => controller.suggestions(req, res)),
  );
  router.get(
    "/:slug",
    asyncHandler((req, res) => controller.getBySlug(req, res)),
  );

  return router;
}
