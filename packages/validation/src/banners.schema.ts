import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the admin banner-management request
 * shapes — used by apps/admin's forms and apps/api's `validate` middleware.
 * Homepage promotional carousel slides (2026-08-31 UI refinement pass).
 */

const urlSchema = z.string().trim().url("Must be a valid URL").max(2048);

/**
 * Banner CTA actions (2026-09-28). Admin picks an action instead of typing a
 * URL; the stored `ctaUrl` becomes a small typed reference the API resolves
 * to a live storefront path (by slug) on every read:
 *   category:<uuid> | collection:<uuid> | product:<uuid> | offers |
 *   new_arrivals | custom:<path-or-url>
 * Anything else that is a site path ("/…") or http(s) URL is a LEGACY raw
 * link from before this change and keeps working unchanged.
 */
export type BannerCtaAction =
  | { type: "NONE" }
  | { type: "CATEGORY"; id: string }
  | { type: "COLLECTION"; id: string }
  | { type: "PRODUCT"; id: string }
  | { type: "OFFERS" }
  | { type: "NEW_ARRIVALS" }
  | { type: "CUSTOM_URL"; url: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROBE_ORIGIN = "https://woobe.invalid";
// Backslashes, whitespace and control characters are rewritten or stripped by
// browsers' URL parsers ("/\\evil.com" and "/\t/evil.com" both become
// "//evil.com"), so they are never allowed in a banner link at all.
function hasUnsafeLinkChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || /\s/.test(char) || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * True only for a same-site path — decided by actually parsing it the way a
 * browser would, not by string prefix: "/products" stays on-site, while
 * "//evil.com", "/\\evil.com" or "/\t/evil.com" resolve to another host and fail.
 */
export function isSitePath(value: string): boolean {
  if (!value.startsWith("/") || hasUnsafeLinkChars(value)) return false;
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

/** An absolute http(s) URL with no characters a browser would silently rewrite. */
function isAbsoluteHttpUrl(value: string): boolean {
  if (hasUnsafeLinkChars(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** A same-site path or an explicit absolute http(s) URL — the only link shapes a banner may point at. */
export function isAllowedBannerLink(value: string): boolean {
  return isSitePath(value) || isAbsoluteHttpUrl(value);
}

/** Parses a stored `ctaUrl`. Returns null for a value that is neither a known action nor a valid legacy link. */
export function parseBannerCta(value: string | null | undefined): BannerCtaAction | null {
  if (value == null || value.trim() === "") return { type: "NONE" };
  const trimmed = value.trim();
  if (trimmed === "offers") return { type: "OFFERS" };
  if (trimmed === "new_arrivals") return { type: "NEW_ARRIVALS" };
  const separator = trimmed.indexOf(":");
  const prefix = separator > 0 ? trimmed.slice(0, separator) : "";
  const rest = separator > 0 ? trimmed.slice(separator + 1) : "";
  if (prefix === "category" || prefix === "collection" || prefix === "product") {
    if (!UUID_PATTERN.test(rest)) return null;
    return { type: prefix === "category" ? "CATEGORY" : prefix === "collection" ? "COLLECTION" : "PRODUCT", id: rest.toLowerCase() };
  }
  if (prefix === "custom") {
    return isAllowedBannerLink(rest) ? { type: "CUSTOM_URL", url: rest } : null;
  }
  // Legacy raw link (pre-2026-09-28 banners).
  return isAllowedBannerLink(trimmed) ? { type: "CUSTOM_URL", url: trimmed } : null;
}

/** The stored form of an action — `null` for NONE (no link). */
export function formatBannerCta(action: BannerCtaAction): string | null {
  switch (action.type) {
    case "NONE":
      return null;
    case "CATEGORY":
      return `category:${action.id}`;
    case "COLLECTION":
      return `collection:${action.id}`;
    case "PRODUCT":
      return `product:${action.id}`;
    case "OFFERS":
      return "offers";
    case "NEW_ARRIVALS":
      return "new_arrivals";
    case "CUSTOM_URL":
      return `custom:${action.url}`;
  }
}

const ctaUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => parseBannerCta(value) !== null, "Choose a valid link: a category, collection, product, offers, new arrivals, or a site path/URL");
const isoDateSchema = z.string().trim().datetime({ message: "Must be an ISO 8601 date-time" });

export const createBannerSchema = z.object({
  imageUrl: urlSchema,
  // Nullable (not just optional) to match updateBannerSchema below — the admin
  // form always sends an explicit `null` for a blank optional field rather than
  // omitting the key, so create must accept the same shape update already does.
  title: z.string().trim().max(200).nullable().optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  ctaUrl: ctaUrlSchema.nullable().optional(),
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
