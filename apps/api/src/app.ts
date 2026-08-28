import path from "node:path";
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

  // Serves what LocalDiskMediaStorage.getUrl() points at (Week 2 Day 4,
  // week2 (1).md §13). Helmet's default `Cross-Origin-Resource-Policy:
  // same-origin` would otherwise block apps/web/apps/admin (different
  // origins/ports) from loading these as plain <img> sources — relaxed to
  // `cross-origin` for this one static mount only, everything else (the
  // JSON API, already governed by the CORS allowlist above) keeps helmet's
  // stricter default.
  app.use(
    "/uploads",
    (req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR)),
  );

  // Every module mounts at /api/v1/<module-name> — see src/modules/index.ts.
  for (const { path, router } of moduleRouters) {
    app.use(`/api/v1${path}`, router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
