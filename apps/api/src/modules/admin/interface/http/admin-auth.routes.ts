import { loginSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { AdminAuthController } from "./admin-auth.controller";

export function createAdminAuthRouter(controller: AdminAuthController): Router {
  const router = Router();

  router.post("/login", validate(loginSchema), asyncHandler((req, res) => controller.login(req, res)));
  router.post("/refresh", asyncHandler((req, res) => controller.refresh(req, res)));
  router.post("/logout", asyncHandler((req, res) => controller.logout(req, res)));
  router.get("/me", authGuard, asyncHandler((req, res) => controller.me(req, res)));

  return router;
}
