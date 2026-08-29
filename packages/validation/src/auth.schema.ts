import { z } from "zod";
import { optionalIndianPhone } from "./shared";

/**
 * Single source of truth for request shapes (ADR-020) — used by
 * apps/web's client-side forms AND apps/api's `validate` middleware.
 * A changed field is a compile error everywhere it's used, not a runtime
 * mismatch discovered in QA.
 */

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: optionalIndianPhone,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
