import { z } from "zod";

/**
 * Single source of truth for the guest-order-claim request shape (ADR-020),
 * used by apps/web's "Add a guest order" form and apps/api's `validate`
 * middleware. Client-review fix (2026-09-03): a guest checkout's `userId`
 * is never set after the fact (see apps/api orders module's own doc
 * comments) — this is how a customer who checked out as a guest, then
 * registered or logged in under a different email, attaches that order to
 * their account: by proving they hold both the order number (delivered
 * only via the confirmation page/email — see OrderNumberGeneratorService,
 * cryptographically random, never guessable) and the exact email it was
 * placed under.
 */
export const claimGuestOrderSchema = z.object({
  // Order numbers are always emitted uppercase (WOOBE-YYYYMMDD-<12 hex>) —
  // normalizing case here is a courtesy for anyone who retypes it by hand
  // or whose email client lowercases links, not a security boundary (the
  // lookup is by exact string either way).
  orderNumber: z
    .string()
    .trim()
    .min(1, "Order number is required")
    .max(64, "Enter a valid order number")
    .transform((value) => value.toUpperCase()),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
});
export type ClaimGuestOrderInput = z.infer<typeof claimGuestOrderSchema>;
