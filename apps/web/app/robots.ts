import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Week 2 Day 9 (week2 (1).md §19). Disallows exactly the routes this app's
 * own per-page `robots: { index: false }` metadata already marks
 * unindexable (account/*, cart, checkout, wishlist, login, register,
 * order-confirmation, payment) — listed here too so a crawler that ignores
 * per-page meta robots (or hasn't rendered the page yet) still gets the
 * same signal from robots.txt. `/payment` (2026-09-22) is the dedicated
 * Razorpay-in-progress page split out of order-confirmation — same private,
 * one-shopper posture.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/cart", "/checkout", "/wishlist", "/login", "/register", "/order-confirmation", "/payment"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
