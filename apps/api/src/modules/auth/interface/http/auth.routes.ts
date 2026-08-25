import { loginSchema, registerSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { AuthController } from "./auth.controller";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post(
    "/register",
    validate(registerSchema),
    asyncHandler((req, res) => controller.register(req, res)),
  );
  router.post(
    "/login",
    validate(loginSchema),
    asyncHandler((req, res) => controller.login(req, res)),
  );
  router.post(
    "/refresh",
    asyncHandler((req, res) => controller.refresh(req, res)),
  );
  router.post(
    "/logout",
    asyncHandler((req, res) => controller.logout(req, res)),
  );
  router.get(
    "/me",
    authGuard,
    asyncHandler((req, res) => controller.me(req, res)),
  );

  return router;
}
