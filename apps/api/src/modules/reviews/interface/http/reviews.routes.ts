import { submitReviewSchema, updateReviewSchema, listReviewsQuerySchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { ReviewsController } from "./reviews.controller";

/** GET is public (any shopper can view reviews, no login needed) — submit/edit/delete require a real session. */
export function createReviewsRouter(controller: ReviewsController): Router {
  const router = Router();

  router.get(
    "/",
    validate(listReviewsQuerySchema, "query"),
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.post(
    "/",
    authGuard,
    validate(submitReviewSchema),
    asyncHandler((req, res) => controller.submit(req, res)),
  );
  router.patch(
    "/:id",
    authGuard,
    validate(updateReviewSchema),
    asyncHandler((req, res) => controller.update(req, res)),
  );
  router.delete("/:id", authGuard, asyncHandler((req, res) => controller.remove(req, res)));

  return router;
}
