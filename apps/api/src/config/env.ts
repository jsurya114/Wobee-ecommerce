import { z } from "zod";

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Deliberately not using the shared logger here — this runs before it exists.
  console.error("Invalid environment configuration:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
