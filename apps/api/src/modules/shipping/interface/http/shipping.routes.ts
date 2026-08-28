import { shippingEstimateQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { validate } from "../../../../middleware/validate";
import type { ShippingController } from "./shipping.controller";

/** Public — a shopper can check serviceability/delivery estimate before logging in, same reasoning as reviews' public GET. */
export function createShippingRouter(controller: ShippingController): Router {
  const router = Router();
  router.get(
    "/estimate",
    validate(shippingEstimateQuerySchema, "query"),
    asyncHandler((req, res) => controller.getEstimate(req, res)),
  );
  return router;
}
