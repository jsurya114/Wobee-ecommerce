import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { captureRawBody } from "./middleware/capture-raw-body";
import { errorHandler } from "./middleware/error-handler";
import { notFoundHandler } from "./middleware/not-found";
import { requestId } from "./middleware/request-id";
import { moduleRouters } from "./modules";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true, // refresh token travels in an httpOnly cookie (ADR-018)
    }),
  );
  // `verify` captures req.rawBody alongside the normal parsed req.body —
  // see capture-raw-body.ts for why this replaces a route-specific
  // express.raw() for the Razorpay webhook route (ADR-014).
  app.use(express.json({ verify: captureRawBody }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(requestId);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "@woobe/api", timestamp: new Date().toISOString() });
  });

  // Every module mounts at /api/v1/<module-name> — see src/modules/index.ts.
  for (const { path, router } of moduleRouters) {
    app.use(`/api/v1${path}`, router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
