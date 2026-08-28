import path from "node:path";
import { z } from "zod";

/**
 * Week 2 Day 0 (bootstrap remediation): `apps/api` has no `.env` of its own
 * and, until now, no code that loaded one — every prior session had to
 * discover by trial and error that it expects the monorepo root `.env`'s
 * values to already be present in the process environment, then `export`
 * them manually before `pnpm --filter @woobe/api run dev`. This closes that
 * gap using Node's built-in loader (stable since Node 20.6/22 — this repo
 * already requires Node >=22, see root package.json) rather than adding a
 * `dotenv` dependency for it.
 *
 * Deliberately best-effort: `loadEnvFile` throws if the file doesn't exist
 * (true in CI, which injects env vars directly — see .github/workflows/ci.yml
 * — and true for anyone who genuinely prefers exporting vars themselves), so
 * this is wrapped and silently skipped rather than crashing. It also never
 * overrides a variable the process already has — verified empirically, not
 * assumed: an already-set `process.env` value always wins over the file's,
 * which is exactly what keeps `vitest.config.ts`'s injected test env
 * (pointing at `woobe_test`, not this file's `woobe_dev`) intact.
 */
try {
  process.loadEnvFile(path.resolve(__dirname, "../../../../.env"));
} catch {
  // No root .env (CI, or a developer who exports vars themselves) — fine.
}

/**
 * Env validation, fail fast — ARCHITECTURE.md §3.4. If a required variable
 * is missing/malformed, the process exits immediately with a clear message
 * instead of failing confusingly later at first use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_TOKEN_TTL: z.string().default("15m"),
  JWT_REFRESH_TOKEN_TTL: z.string().default("30d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive().default(12),

  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:3001"),
  COOKIE_DOMAIN: z.string().default("localhost"),
  COOKIE_SECRET: z.string().min(1, "COOKIE_SECRET is required"),

  // Stubbed until Week 1 Day 5 (ADR-014) — see DECISIONS_PENDING.md #4.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Week 2 Day 4 (week2 (1).md §13) — the `media` module's local-disk
  // MediaStoragePort implementation needs an absolute origin to build a
  // browser-loadable image URL (a relative path only works when the
  // browser is already on the API's own origin, which apps/web/apps/admin
  // never are — different ports). Swapping in an S3/Cloudinary adapter
  // later replaces this entirely; nothing else in the codebase reads it.
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  MEDIA_UPLOAD_DIR: z.string().default("uploads"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Deliberately not using the shared logger here — this runs before it exists.
  console.error("Invalid environment configuration:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
