import { loginSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import type { AdminAuthController } from "./admin-auth.controller";

// Staff Management System (2026-09-06) fix, bundled with this work per the
// architecture report's §13/§17 — this route had NO rate limiting at all,
// unlike the customer /auth/login it shares LoginUserUseCase with (see
// auth.routes.ts's own AUTH_RATE_LIMIT comment for the original 2026-09-04
// security-audit fix this route was somehow left out of).
//
// NOT reusing that 30/10min budget, though — unlike customer login, this one
// route is also this whole test suite's own admin-session setup helper,
// called from nearly every admin-*.integration.test.ts file (every one of
// them logs in as admin@woobe.in at least once; several dozen times each in
// admin-staff/admin/products/banners/coupons/collections/returns). Measured
// 150+ real calls/run across the suite, all sharing one IP-keyed bucket —
// same "not a route real traffic reaches at this volume, only test/tooling"
// reasoning auth.routes.ts's own DIRECT_REGISTER_RATE_LIMIT already uses for
// an analogous internal-heavy-use endpoint. Real admin-login traffic is a
// handful of staff members occasionally signing in — a 400/10min ceiling
// still meaningfully throttles brute-forcing while clearing the test
// suite's real volume with headroom.
const ADMIN_AUTH_RATE_LIMIT = { max: 400, windowSeconds: 10 * 60 };

export function createAdminAuthRouter(controller: AdminAuthController): Router {
  const router = Router();

  router.post(
    "/login",
    rateLimit({ keyPrefix: "admin-auth:login", ...ADMIN_AUTH_RATE_LIMIT }),
    validate(loginSchema),
    asyncHandler((req, res) => controller.login(req, res)),
  );
  router.post("/refresh", asyncHandler((req, res) => controller.refresh(req, res)));
  router.post("/logout", asyncHandler((req, res) => controller.logout(req, res)));
  router.get("/me", authGuard, asyncHandler((req, res) => controller.me(req, res)));

  return router;
}
