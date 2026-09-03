import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  registerStartSchema,
  resendOtpSchema,
  resendPasswordResetOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  verifyResetOtpSchema,
} from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import type { AuthController } from "./auth.controller";

// Security audit fix (2026-09-04): every credential- or OTP-guessing route
// below had NO rate limiting at all (otp.policy.ts's own doc comment
// flagged this as an open gap) — an attacker (or just a buggy client) could
// hammer /login or brute-force a 4-digit OTP with unlimited requests. One
// limiter per route (own Redis key prefix, so a burst on one route never
// eats another's budget) — 30 requests/10min per IP comfortably clears
// auth.integration.test.ts's real measured call volume on every one of
// these routes (login 8, forgot-password 8, reset-password 19,
// reset-password/verify 2, reset-password/resend 2, register/resend 4)
// while still meaningfully throttling automated abuse.
const AUTH_RATE_LIMIT = { max: 30, windowSeconds: 10 * 60 };
// register/start + register/verify are also what `registerViaOtp()` (this
// suite's own account-setup helper) calls for EVERY test user across all of
// auth.integration.test.ts, plus its own dedicated wrong-OTP-attempts test —
// measured 23 and 32 real calls/run respectively. Given ~2x headroom rather
// than reusing AUTH_RATE_LIMIT's 30 (32 already exceeds it).
const OTP_REGISTER_RATE_LIMIT = { max: 60, windowSeconds: 10 * 60 };
// The direct /register path is exercised at high volume purely as this
// repo's own integration-test user-setup helper (~90 calls/run from a single
// IP, well within one window) — not a route real traffic reaches (apps/web
// uses the OTP flow instead). A much looser ceiling here still bounds actual
// abuse without that legitimate internal volume ever tripping it.
const DIRECT_REGISTER_RATE_LIMIT = { max: 300, windowSeconds: 10 * 60 };

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  // Email-OTP registration — what apps/web's "Create account" now uses.
  router.post(
    "/register/start",
    rateLimit({ keyPrefix: "auth:register-start", ...OTP_REGISTER_RATE_LIMIT }),
    validate(registerStartSchema),
    asyncHandler((req, res) => controller.startRegistration(req, res)),
  );
  router.post(
    "/register/verify",
    rateLimit({ keyPrefix: "auth:register-verify", ...OTP_REGISTER_RATE_LIMIT }),
    validate(verifyOtpSchema),
    asyncHandler((req, res) => controller.verifyRegistrationOtp(req, res)),
  );
  router.post(
    "/register/resend",
    rateLimit({ keyPrefix: "auth:register-resend", ...AUTH_RATE_LIMIT }),
    validate(resendOtpSchema),
    asyncHandler((req, res) => controller.resendRegistrationOtp(req, res)),
  );

  // The direct, non-OTP path. apps/web no longer calls this — it exists for
  // in-process/admin/tooling account creation. Follow-up: gate or remove it
  // once every integration suite's user-setup helper moves to the OTP flow.
  router.post(
    "/register",
    rateLimit({ keyPrefix: "auth:register", ...DIRECT_REGISTER_RATE_LIMIT }),
    validate(registerSchema),
    asyncHandler((req, res) => controller.register(req, res)),
  );

  // Forgot / reset password — reuses the registration OTP machinery.
  router.post(
    "/forgot-password",
    rateLimit({ keyPrefix: "auth:forgot-password", ...AUTH_RATE_LIMIT }),
    validate(forgotPasswordSchema),
    asyncHandler((req, res) => controller.forgotPassword(req, res)),
  );
  router.post(
    "/reset-password/verify",
    rateLimit({ keyPrefix: "auth:reset-password-verify", ...AUTH_RATE_LIMIT }),
    validate(verifyResetOtpSchema),
    asyncHandler((req, res) => controller.verifyResetPasswordOtp(req, res)),
  );
  router.post(
    "/reset-password",
    rateLimit({ keyPrefix: "auth:reset-password", ...AUTH_RATE_LIMIT }),
    validate(resetPasswordSchema),
    asyncHandler((req, res) => controller.resetPassword(req, res)),
  );
  router.post(
    "/reset-password/resend",
    rateLimit({ keyPrefix: "auth:reset-password-resend", ...AUTH_RATE_LIMIT }),
    validate(resendPasswordResetOtpSchema),
    asyncHandler((req, res) => controller.resendPasswordResetOtp(req, res)),
  );

  router.post(
    "/login",
    rateLimit({ keyPrefix: "auth:login", ...AUTH_RATE_LIMIT }),
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
