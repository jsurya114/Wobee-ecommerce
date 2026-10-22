import type { BannerCtaAction } from "@woobe/validation";

/** Active storefront targets a banner can link to, keyed by id -> slug. Inactive/missing targets are simply absent. */
export interface BannerLinkTargets {
  categories: Map<string, string>;
  collections: Map<string, string>;
  products: Map<string, string>;
}

/**
 * Pure (no I/O) — turns a banner's CTA action into the storefront href it
 * should open, or null for "no link". A link to a category/collection/product
 * that no longer exists or is inactive resolves to null (the CTA is hidden)
 * instead of sending shoppers to a dead page. Internal targets always resolve
 * to a relative path; only an explicit CUSTOM_URL (or a legacy raw link) can
 * be absolute, and the storefront still runs its own `isSafeHref` on it.
 */
export function resolveBannerCtaHref(action: BannerCtaAction | null, targets: BannerLinkTargets): string | null {
  if (!action) return null;
  switch (action.type) {
    case "NONE":
      return null;
    case "CATEGORY": {
      const slug = targets.categories.get(action.id);
      return slug ? `/products?category=${encodeURIComponent(slug)}` : null;
    }
    case "COLLECTION": {
      const slug = targets.collections.get(action.id);
      return slug ? `/collections/${encodeURIComponent(slug)}` : null;
    }
    case "PRODUCT": {
      const slug = targets.products.get(action.id);
      return slug ? `/products/${encodeURIComponent(slug)}` : null;
    }
    case "OFFERS":
      return "/products?onOffer=true";
    case "NEW_ARRIVALS":
      return "/products?sort=newest";
    case "CUSTOM_URL":
      return action.url;
  }
}
