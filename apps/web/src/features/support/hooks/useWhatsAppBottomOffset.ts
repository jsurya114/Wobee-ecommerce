"use client";

import { usePathname } from "next/navigation";
import { useCartWeightBarVisibility } from "@/features/cart/hooks/useCartWeightBarVisibility";
import {
  CART_WEIGHT_INDICATOR_HEIGHT_REM,
  FLOATING_STACK_GAP_REM,
  MOBILE_BOTTOM_NAV_HEIGHT_REM,
  STICKY_ACTION_BAR_HEIGHT_REM,
} from "@/lib/layout-constants";

/** Routes with their own full-width sticky action bar above BottomNav (see `STICKY_ACTION_BAR_HEIGHT_REM`'s doc comment). */
function hasStickyActionBar(pathname: string | null): boolean {
  return (pathname?.startsWith("/products/") ?? false) || pathname === "/cart";
}

/**
 * The one place that knows what else is currently occupying the bottom of
 * the mobile viewport, so `WhatsAppButton` can clear it — a route's sticky
 * action bar and the floating cart-weight pill are mutually exclusive (see
 * `useCartWeightBarVisibility`'s own doc comment), so at most one of them is
 * ever reserved at a time. Pure route/cart-state derivation, no scroll
 * listener.
 */
export function useWhatsAppBottomOffset(): string {
  const pathname = usePathname();
  const showsCartWeightBar = useCartWeightBarVisibility();

  const reserved = hasStickyActionBar(pathname)
    ? STICKY_ACTION_BAR_HEIGHT_REM
    : showsCartWeightBar
      ? CART_WEIGHT_INDICATOR_HEIGHT_REM
      : "0rem";

  return `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + ${reserved} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})`;
}
