import { z } from "zod";
import { indianPhone } from "./shared";

/**
 * Single source of truth (ADR-020) for the Week 2 Day 3 profile + address
 * request shapes — used by apps/web's account/address forms and apps/api's
 * `validate` middleware.
 *
 * Deliberate scope call (week2 (1).md §6): only `name` is editable via
 * `updateProfileSchema`. `email`/`phone` are excluded on purpose — §6 says
 * "sensitive identity changes must use the approved verification flow," and
 * no such flow (OTP/email-confirmation) exists in this codebase yet
 * (`AuthCredential` is only "extensible for OTP later" per plan.md §3 —
 * nothing built). Accepting an unverified email/phone change here would be
 * inventing a security-relevant flow the plan explicitly didn't approve —
 * see users.module.ts's own doc comment for the full reasoning.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Address fields mirror checkout.schema.ts's `checkoutAddressSchema` exactly
 * (fullName/phone/line1/line2/city/state/pincode) plus `isDefault` — same
 * shape, same Indian-phone/6-digit-pincode rules, so the address book and
 * checkout's one-off address form never validate differently for the same
 * field. Deliberately not re-exporting `checkoutAddressSchema` itself: that
 * schema's own doc comment scopes it to "the checkout request shape" and
 * checkout intentionally stayed independent of the address book this week
 * (week2 (1).md doesn't ask for the two to be wired together) — duplicating
 * the five-line shape here keeps that independence honest instead of
 * silently coupling the two call sites through a shared import.
 */
const addressFields = {
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  phone: indianPhone,
  line1: z.string().trim().min(3, "Address line 1 is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "City is required").max(100),
  state: z.string().trim().min(2, "State is required").max(100),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
};

export const createAddressSchema = z.object({
  ...addressFields,
  isDefault: z.boolean().optional().default(false),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

// Partial — PATCH semantics, only the fields being changed need to be sent.
// No `isDefault` here deliberately: week2 (1).md §7 lists "Set default
// address" as its own bullet, separate from edit — POST .../default is the
// one path that changes it, so an edit can never accidentally flip it as a
// side effect of an unrelated field change.
export const updateAddressSchema = z
  .object(addressFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
