export interface NavLink {
  label: string;
  href: string;
}

/**
 * "Shop Your Size" has no dedicated destination — the PLP's own size sheet
 * (`SizeQuickFilter`) has no URL-driven "open on load" hook today, and
 * adding one would duplicate filter-opening logic the PLP already owns. So
 * this points at the same `/products` destination as "Shop All", where the
 * size filter is one tap away — not a second size taxonomy.
 */
/** Rendered first, before the Categories disclosure. */
export const SHOP_ALL_LINK: NavLink = { label: "Shop All", href: "/products" };

/** Rendered after the Categories disclosure. */
export const SHOP_LINKS: NavLink[] = [
  { label: "Shop Your Size", href: "/products" },
  { label: "New Arrivals", href: "/products?sort=newest" },
  { label: "Loved by Customers", href: "/#loved-by-customers" },
  { label: "Curated Collections", href: "/#curated-collections" },
];

/**
 * All four deep-link into the existing Help & Support hub (`/account/help`)
 * via `?topic=`. "Shipping & Delivery" reuses the hub's existing "Orders &
 * Delivery" screen — there's no separate shipping-policy content anywhere
 * in the app yet, and that screen already covers delivery status/tracking
 * (see `HelpSupportPage`'s own `TOPICS` entry) — see the `shipping` alias in
 * `HELP_TOPIC_TO_SCREEN` (HelpSupportPage.tsx).
 */
export const HELP_LINKS: NavLink[] = [
  { label: "Help Center", href: "/account/help" },
  { label: "Track My Order", href: "/account/orders" },
  { label: "Shipping & Delivery", href: "/account/help?topic=shipping" },
  { label: "Returns & Refunds", href: "/account/help?topic=returns" },
  { label: "Payment & COD", href: "/account/help?topic=payments" },
  { label: "Contact Us", href: "/account/help?topic=contact" },
];

export const ABOUT_LINKS: NavLink[] = [{ label: "How Woobe Works", href: "/how-it-works" }];
