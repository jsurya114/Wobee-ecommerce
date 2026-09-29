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
      .max(30, "Keep each preset to 30 characters or fewer")
      .refine((value) => !value.includes(","), "A preset can't contain a comma"),
  )
  .min(1, "Keep at least one option")
  .max(50, "At most 50 options")
  .refine((values) => new Set(values.map((v) => v.toLowerCase())).size === values.length, "Each option must be unique");

/**
 * Homepage "Shop by Budget" tiles (2026-09-29). Price is integer paise; the
 * admin form converts from rupees. coverImageUrl: an absolute URL from the
 * media endpoint or an app-relative path; null = auto (top in-budget
 * product's photo).
 */
export const budgetTileSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(40, "Keep the label to 40 characters or fewer"),
  maxPricePaise: z.number().int().positive("Max price must be more than ₹0").max(100_000_000, "That's more than ₹10,00,000"),
  coverImageUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => /^https?:\/\//.test(value) || value.startsWith("/"), "Invalid image URL")
    .nullable()
    .default(null),
});
export type BudgetTileInput = z.infer<typeof budgetTileSchema>;

/** Store settings (AppConfig singleton) — partial update. */
export const updateAppConfigSchema = z
  .object({
    minCartQuantity: z.number().int().min(1, "Must be at least 1").max(100, "At most 100"),
    presetSizes: presetListSchema,
    presetFabrics: presetListSchema,
    presetFits: presetListSchema,
    returnsEnabled: z.boolean(),
    codShippingUpfront: z.boolean(),
    budgetTiles: z
      .array(budgetTileSchema)
      .min(1, "Keep at least one tile")
      .max(6, "At most 6 tiles")
      // Two tiles with the same cap would link to the same filtered page (and collide as React keys on the storefront).
      .refine((tiles) => new Set(tiles.map((tile) => tile.maxPricePaise)).size === tiles.length, "Each tile needs a different max price"),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update" });
export type UpdateAppConfigInput = z.infer<typeof updateAppConfigSchema>;
