import { analyticsEventSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { optionalAuthGuard } from "../../../../middleware/optional-auth-guard";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import type { AnalyticsController } from "./analytics.controller";

// A normal browsing session fires a handful of events; 120/min per IP leaves
// room for a shared NAT / office while still bounding a flood.
const COLLECTOR_RATE_LIMIT = { max: 120, windowSeconds: 60 };

export function createAnalyticsRouter(controller: AnalyticsController): Router {
  const router = Router();
  router.post(
    "/events",
    rateLimit({ keyPrefix: "analytics:events", ...COLLECTOR_RATE_LIMIT }),
    optionalAuthGuard,
    validate(analyticsEventSchema),
    asyncHandler((req, res) => controller.recordEvent(req, res)),
  );
  return router;
}
