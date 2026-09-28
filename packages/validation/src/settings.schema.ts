import { z } from "zod";

/**
 * Admin Settings (2026-09-28). Money is integer paise and weight is integer
 * grams on the wire (DEVELOPMENT_RULES.md #4) — the admin form converts
 * rupees -> paise at its own display boundary, never here.
 */

/** Cart & Shipping Rules — a partial patch merged onto the CURRENT ShippingRule and saved as a new, versioned row. */
export const updateShippingRuleSchema = z
  .object({
    minWeightGramsForCheckout: z.number().int().min(0, "Can't be negative").max(100_000, "That's more than 100 kg"),
    freeDeliveryThresholdGrams: z.number().int().min(0, "Can't be negative").max(100_000, "That's more than 100 kg"),
    standardFeePaise: z.number().int().min(0, "Can't be negative").max(10_000_000, "That's more than ₹1,00,000"),
    freeDeliveryMinSubtotalPaise: z.number().int().min(0, "Can't be negative").max(100_000_000, "That's more than ₹10,00,000"),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update" });
export type UpdateShippingRuleInput = z.infer<typeof updateShippingRuleSchema>;

/**
 * One preset list (sizes / fabrics / fits). Stored comma-separated, so a
 * single value can't itself contain a comma; duplicates (case-insensitive)
 * are rejected rather than silently collapsed so the admin sees why.
 */
const presetListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "A preset can't be empty")
      .max(40, "Keep each preset under 40 characters")
      .refine((value) => !value.includes(","), "A preset can't contain a comma"),
  )
  .min(1, "Keep at least one option")
  .max(50, "At most 50 options")
  .refine((values) => new Set(values.map((v) => v.toLowerCase())).size === values.length, "Each option must be unique");

/** Store settings (AppConfig singleton) — partial update. */
export const updateAppConfigSchema = z
  .object({
    minCartQuantity: z.number().int().min(1, "Must be at least 1").max(100, "At most 100"),
    presetSizes: presetListSchema,
    presetFabrics: presetListSchema,
    presetFits: presetListSchema,
    returnsEnabled: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update" });
export type UpdateAppConfigInput = z.infer<typeof updateAppConfigSchema>;
