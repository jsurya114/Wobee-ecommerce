import { loginSchema, registerSchema, registerStartSchema, resendOtpSchema, verifyOtpSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { AuthController } from "./auth.controller";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  // Email-OTP registration — what apps/web's "Create account" now uses.
  router.post(
    "/register/start",
    validate(registerStartSchema),
    asyncHandler((req, res) => controller.startRegistration(req, res)),
  );
  router.post(
    "/register/verify",
    validate(verifyOtpSchema),
    asyncHandler((req, res) => controller.verifyRegistrationOtp(req, res)),
  );
  router.post(
    "/register/resend",
    validate(resendOtpSchema),
    asyncHandler((req, res) => controller.resendRegistrationOtp(req, res)),
  );

  // The direct, non-OTP path. apps/web no longer calls this — it exists for
  // in-process/admin/tooling account creation. Follow-up: gate or remove it
  // once every integration suite's user-setup helper moves to the OTP flow.
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
