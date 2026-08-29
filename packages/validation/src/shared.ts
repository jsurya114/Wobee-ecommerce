import { z } from "zod";

/**
 * Cross-schema validation primitives (ADR-020). Extracted here once a
 * second schema (checkout.schema.ts, Week 1 Day 4) needed the same Indian
 * mobile number rule auth.schema.ts already had — kept in one place instead
 * of copy-pasted, so the two never drift out of sync.
 */

// Indian mobile numbers: optional +91, then 10 digits starting 6-9.
export const indianPhone = z
  .string()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

// A blank HTML input submits "" (not undefined) for an untouched optional
// field — without this, "" would fail indianPhone's regex and block
// submission for anyone who leaves phone empty. "" is treated the same as
// omitted; anything else must be a valid number.
export const optionalIndianPhone = z
  .union([z.literal(""), indianPhone])
  .optional()
  .transform((val) => (val === "" ? undefined : val));
