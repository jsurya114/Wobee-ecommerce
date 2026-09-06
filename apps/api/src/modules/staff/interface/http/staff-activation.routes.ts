import { activateStaffSchema, verifyStaffInvitationSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import type { StaffActivationController } from "./staff-activation.controller";

// Same budget/window as auth.routes.ts's own AUTH_RATE_LIMIT — an
// invitation-code-guessing surface is exactly the kind of route that gap
// was closed for; no reason for this one to be any looser.
const STAFF_ACTIVATION_RATE_LIMIT = { max: 30, windowSeconds: 10 * 60 };

/** Public, pre-auth — mounted at /api/v1/staff (see modules/index.ts). Not permission-gated: an invited staff member has no session yet. */
export function createStaffActivationRouter(controller: StaffActivationController): Router {
  const router = Router();

  router.post(
    "/activate/verify",
    rateLimit({ keyPrefix: "staff-activation:verify", ...STAFF_ACTIVATION_RATE_LIMIT }),
    validate(verifyStaffInvitationSchema),
    asyncHandler((req, res) => controller.verify(req, res)),
  );
  router.post(
    "/activate",
    rateLimit({ keyPrefix: "staff-activation:activate", ...STAFF_ACTIVATION_RATE_LIMIT }),
    validate(activateStaffSchema),
    asyncHandler((req, res) => controller.activate(req, res)),
  );

  return router;
}
