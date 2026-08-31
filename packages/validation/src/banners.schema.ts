import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the admin banner-management request
 * shapes — used by apps/admin's forms and apps/api's `validate` middleware.
 * Homepage promotional carousel slides (2026-08-31 UI refinement pass).
 */

const urlSchema = z.string().trim().url("Must be a valid URL").max(2048);
// Internal storefront routes (e.g. "/products?category=dresses") aren't
// absolute URLs — accepted alongside a full URL for ctaUrl specifically.
const ctaUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Must be a site path (starting with /) or a full URL");
const isoDateSchema = z.string().trim().datetime({ message: "Must be an ISO 8601 date-time" });

export const createBannerSchema = z.object({
  imageUrl: urlSchema,
  title: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(300).optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: ctaUrlSchema.optional(),
  startAt: isoDateSchema.nullable().optional(),
  endAt: isoDateSchema.nullable().optional(),
});
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = z.object({
  imageUrl: urlSchema.optional(),
  title: z.string().trim().max(200).nullable().optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  ctaUrl: ctaUrlSchema.nullable().optional(),
  startAt: isoDateSchema.nullable().optional(),
  endAt: isoDateSchema.nullable().optional(),
});
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const setBannerActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetBannerActiveInput = z.infer<typeof setBannerActiveSchema>;

export const reorderBannersSchema = z.object({
  bannerIds: z.array(z.string().uuid("Invalid banner id")).min(1, "At least one banner id is required"),
});
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>;
