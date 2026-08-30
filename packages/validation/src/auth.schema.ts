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

const emailField = z.string().trim().toLowerCase().email("Enter a valid email address");

/**
 * Email-OTP registration is a two-step flow (see apps/api auth module).
 * Step 1 takes the same payload the account is ultimately created from —
 * aliased, not re-declared, so the shared shape can't drift.
 */
export const registerStartSchema = registerSchema;
export type RegisterStartInput = z.infer<typeof registerStartSchema>;

/** Number of digits in the registration OTP. Single source for the schema, the web input, and the API generator/policy. */
export const OTP_CODE_LENGTH = 4;

/** Step 2 — the code plus the email it was sent to. */
export const verifyOtpSchema = z.object({
  email: emailField,
  code: z.string().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), `Enter the ${OTP_CODE_LENGTH}-digit code`),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/** "Resend code" — just the pending email. */
export const resendOtpSchema = z.object({ email: emailField });
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
