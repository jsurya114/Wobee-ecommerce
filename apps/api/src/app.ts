import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { resolveTrustProxyHops } from "./config/trust-proxy";
import { captureRawBody } from "./middleware/capture-raw-body";
import { errorHandler } from "./middleware/error-handler";
import { notFoundHandler } from "./middleware/not-found";
import { requestId } from "./middleware/request-id";
import { moduleRouters } from "./modules";
import { httpMetricsMiddleware } from "./shared/infrastructure/observability/prometheus/http-metrics.middleware";
import { metricsHandler } from "./shared/infrastructure/observability/prometheus/metrics-route";

export interface ReadinessResult {
  ready: boolean;
  details?: Record<string, boolean>;
}

export interface CreateAppOptions {
  /**
   * Injected from server.ts, the one file (besides worker.ts) ADR-010
   * exempts to import @woobe/database/redis directly — keeps app.ts itself
   * DB/Redis-agnostic and testable without either (see app.test.ts, which
   * constructs the app with no options and expects `/ready` to report ready
   * unconditionally). Defaults to "always ready" for exactly that reason.
   */
  checkReadiness?: () => Promise<ReadinessResult>;
}

export function createApp(options: CreateAppOptions = {}): Application {
  const checkReadiness = options.checkReadiness ?? (async (): Promise<ReadinessResult> => ({ ready: true }));
  const app = express();

  // Behind nginx in production: use the client address nginx established
  // (rate limits key on req.ip). See config/trust-proxy.ts.
  app.set("trust proxy", resolveTrustProxyHops(env.NODE_ENV, env.TRUST_PROXY_HOPS));

  // FIRST in the chain, deliberately — before helmet, CORS and the body
  // parser — so requests rejected by those (malformed JSON -> 400, oversized
  // body -> 413, CORS) are counted and timed too, and the duration covers the
  // body read. It excludes /metrics, /health and /ready itself (see the
  // middleware's own comment). A request that never reaches a route is
  // labelled route="NOT_FOUND" (404) or "UNMATCHED" (anything else).
  app.use(httpMetricsMiddleware);

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
  // Prometheus scrapes this directly on loopback (127.0.0.1:API_PORT),
  // never through nginx — see metrics-route.ts and
  // modules/ec2/tests/run-nginx-tests.sh (asserts nginx returns 403 for
  // /metrics) for the two independent layers that keep it off the public
  // internet.
  app.get("/metrics", (req, res, next) => {
    metricsHandler(req, res).catch(next);
  });

  // Liveness only — deliberately does no I/O, so it can never itself become
  // the reason a healthy-but-overloaded process gets killed.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "@woobe/api", timestamp: new Date().toISOString() });
  });

  // Readiness — a cheap DB+Redis ping so a Kubernetes readiness probe (or
  // any load balancer) stops routing traffic to a pod that's up but can't
  // actually reach its dependencies. Deliberately does NOT check BullMQ
  // queue depth or SMTP reachability here — those matter operationally but
  // would make this probe itself slow/flaky; track them as separate metrics
  // instead (see the forensic review's Observability section).
  app.get("/ready", async (_req, res) => {
    const result = await checkReadiness();
    res.status(result.ready ? 200 : 503).json({ status: result.ready ? "ready" : "not-ready", ...result.details });
  });

  // Serves what LocalDiskMediaStorage.getUrl() points at — ONLY when that
  // dev/test driver is active. With MEDIA_STORAGE_DRIVER=s3 (production) media
  // is delivered by CloudFront and this API serves no files at all.
  if (env.MEDIA_STORAGE_DRIVER === "local") {
    // (Week 2 Day 4, week2 (1).md §13.) Helmet's default `Cross-Origin-Resource-Policy:
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
      express.static(path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR), {
        // Every key here is a randomUUID() minted once at upload time and
        // never reused or overwritten (local-disk-media-storage.service.ts) —
        // these URLs are content-immutable by construction, so a long,
        // immutable cache lifetime is safe (unlike serve-static's `maxAge: 0`
        // default, which forces a conditional GET, and therefore a disk
        // `stat()`, on every single repeat image view). Also the setting a
        // future CloudFront distribution in front of this needs to actually
        // cache effectively at the edge instead of revalidating on every hit.
        maxAge: "365d",
        immutable: true,
      }),
    );
  }

  // Every module mounts at /api/v1/<module-name> — see src/modules/index.ts.
  for (const { path, router } of moduleRouters) {
    app.use(`/api/v1${path}`, router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
