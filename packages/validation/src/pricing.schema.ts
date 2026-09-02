import { z } from "zod";

/**
 * Admin Settings — the global ₹/kg rate. Integer paise only
 * (DEVELOPMENT_RULES.md #4 — no floating-point money), strictly positive
 * (a zero or negative rate is never a valid business state, unlike a
 * per-variant override which used to allow 0 as a deliberate "free" price —
 * that field is deprecated and doesn't apply here).
 */
export const updatePricingSettingSchema = z.object({
  ratePerKgPaise: z.coerce.number().int().positive("Rate must be a positive number of paise per kg"),
});
export type UpdatePricingSettingInput = z.infer<typeof updatePricingSettingSchema>;
