"use client";

import { usePathname } from "next/navigation";
import { useCart } from "./useCart";

/**
 * Routes where the floating pill would duplicate or fight page content
 * already doing this job: `/cart` and `/checkout` show the full inline
 * `WeightThresholdBanner`; a PDP (`/products/[slug]`) has its own sticky buy
 * bar (price + add-to-bag) and doesn't need a second full-width bar stacked
 * above it; `/order-confirmation` is a completed-order page, not a
 * still-shopping one. `/products` itself (the PLP) is deliberately NOT
 * excluded — only the trailing-slash PDP shape is.
 *
 * `/login` and `/register` (bugfix, 2026-09-05): these are pure
 * authentication surfaces (`AuthShell`) — a cart-weight nudge has no business
 * fighting for attention there, same reasoning `WhatsAppButton`'s own
 * `HIDDEN_ON_PATHS` already applies to this exact pair of routes.
 */
const HIDDEN_ROUTE_PREFIXES = ["/cart", "/checkout", "/products/", "/order-confirmation", "/login", "/register"];

/**
 * Shared by `FloatingCartWeightIndicator` (to decide whether to render) and
 * `useWhatsAppBottomOffset` (to know whether it needs to clear the pill) —
 * one source of truth for "is the floating weight pill showing right now"
 * so the two can never disagree about it.
 */
export function useCartWeightBarVisibility(): boolean {
  const pathname = usePathname();
  const { cart } = useCart();

  if (!cart || cart.weightBasedTotalGrams === 0) return false;
  if (HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return false;
  return true;
}
