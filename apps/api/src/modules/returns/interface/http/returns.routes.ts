import { listMyReturnsQuerySchema, requestReturnSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { ReturnsController } from "./returns.controller";

/** Returns require a real account (a Return has no guest path — same reasoning as coupons, Week 2 Day 5). */
export function createReturnsRouter(controller: ReturnsController): Router {
  const router = Router();
  router.use(authGuard);

  router.post("/", validate(requestReturnSchema), asyncHandler((req, res) => controller.requestReturn(req, res)));
  router.get("/", validate(listMyReturnsQuerySchema, "query"), asyncHandler((req, res) => controller.listMine(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));

  return router;
}
