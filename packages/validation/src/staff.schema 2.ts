import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the Staff Management System's request
 * shapes — used by apps/admin's Staff forms and apps/api's `validate`
 * middleware. Deliberately never includes CUSTOMER as an assignable value —
 * this whole surface is ADR-024's three contracted staff roles only.
 */

const emailField = z.string().trim().toLowerCase().email("Enter a valid email address");

/** The three roles this surface can assign — CUSTOMER is never a valid target here (see this file's own doc comment). */
export const STAFF_ROLE = ["SUPER_ADMIN", "ORDER_PROCESSING_STAFF", "PRODUCT_MANAGEMENT_STAFF"] as const;
export type StaffRole = (typeof STAFF_ROLE)[number];
const staffRoleField = z.enum(STAFF_ROLE);

/** Same 4-digit shape as every other OTP-style code in this codebase (see @woobe/validation's own OTP_CODE_LENGTH in auth.schema.ts). */
const invitationCodeField = z.string().regex(/^\d{4}$/, "Enter the 4-digit code");

/** Mirrors auth.schema.ts's own `passwordField` exactly — the same strength rule everywhere a password is set, never redeclared with different rules. */
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: emailField,
  role: staffRoleField,
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

const staffStatusField = z.enum(["ACTIVE", "INVITED", "DEACTIVATED"]);

export const listStaffQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: staffRoleField.optional(),
  status: staffStatusField.optional(),
});
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

export const changeStaffRoleSchema = z.object({ role: staffRoleField });
export type ChangeStaffRoleInput = z.infer<typeof changeStaffRoleSchema>;

export const setStaffActiveSchema = z.object({ isActive: z.boolean() });
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;

/** Public, pre-auth: confirms the invitation code without consuming it — same two-step shape as auth's verifyResetOtpSchema/resetPasswordSchema. */
export const verifyStaffInvitationSchema = z.object({ email: emailField, code: invitationCodeField });
export type VerifyStaffInvitationInput = z.infer<typeof verifyStaffInvitationSchema>;

/** Public, pre-auth: the (already-verified) code plus the chosen password — finishes activation. */
export const activateStaffSchema = z.object({
  email: emailField,
  code: invitationCodeField,
  password: passwordField,
});
export type ActivateStaffInput = z.infer<typeof activateStaffSchema>;

/**
 * Client form only (apps/admin's /activate page) — everything activateStaffSchema
 * needs plus a confirmation field that must match, same pattern as
 * auth.schema.ts's own resetPasswordFormSchema. The API never sees
 * `confirmPassword`; the form sends email/code/password on activateStaffSchema.
 */
export const activateStaffFormSchema = z
  .object({
    email: emailField,
    code: invitationCodeField,
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type ActivateStaffFormValues = z.infer<typeof activateStaffFormSchema>;
