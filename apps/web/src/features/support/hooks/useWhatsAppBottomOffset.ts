"use client";

import { usePathname } from "next/navigation";
import { useCart } from "@/features/cart/hooks/useCart";
import { useCartWeightBarVisibility } from "@/features/cart/hooks/useCartWeightBarVisibility";
import {
  CART_CHECKOUT_DOCK_HEIGHT_REM,
  CART_WEIGHT_INDICATOR_HEIGHT_REM,
  FLOATING_STACK_GAP_REM,
  MOBILE_BOTTOM_NAV_HEIGHT_REM,
  STICKY_ACTION_BAR_HEIGHT_REM,
} from "@/lib/layout-constants";

/** The PDP's mobile buy bar — flush against the nav dock's own top edge, no gap of its own (`ABOVE_MOBILE_BOTTOM_NAV_STYLE`). */
function hasFlushActionBar(pathname: string | null): boolean {
  return pathname?.startsWith("/products/") ?? false;
}

/** The cart page's unified checkout dock (`CheckoutDock.tsx`) — floats its own `FLOATING_STACK_GAP_REM` above the nav dock, same as the weight pill (2026-09-03 refinement pass 2, `CartPageContent`'s own `bottom` style). */
function hasFloatingActionBar(pathname: string | null): boolean {
  return pathname === "/cart";
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
  // Only actually read on `/cart`, but hooks can't be called conditionally —
  // `CheckoutDock` needs this exact same `weightBasedTotalGrams > 0` check to
  // decide whether it renders its own weight row, so the two must agree.
  const { cart } = useCart();

  // The PDP buy bar sits flush against the nav dock's own top edge (no gap
  // of its own — `ABOVE_MOBILE_BOTTOM_NAV_STYLE`), so `reserved` is just its
  // height. The cart checkout dock and the cart-weight pill both instead
  // FLOAT their own `FLOATING_STACK_GAP_REM` above the nav (their own
  // `bottom` styles) — that gap has to be folded into `reserved` here too,
  // or this hook's own trailing `+ FLOATING_STACK_GAP_REM` (WhatsApp's
  // clearance above whichever bar is reserved) lands exactly on that bar's
  // own top edge with zero space between them (confirmed live, 2026-09-03:
  // measured 0px gap for the weight pill before this fix, reading as a
  // visual collision, not a mistake in this hook's — surviving — logic, but
  // a missing term; the checkout dock needs the identical fix since it
  // floats the same way). The dock's own height also varies with whether it
  // renders a weight row (2026-09-04, `CheckoutDock`) — same condition here.
  const cartDockHeightReserved = cart && cart.weightBasedTotalGrams > 0 ? CART_CHECKOUT_DOCK_HEIGHT_REM : STICKY_ACTION_BAR_HEIGHT_REM;

  const reserved = hasFlushActionBar(pathname)
    ? STICKY_ACTION_BAR_HEIGHT_REM
    : hasFloatingActionBar(pathname)
      ? `calc(${cartDockHeightReserved} + ${FLOATING_STACK_GAP_REM})`
      : showsCartWeightBar
        ? `calc(${CART_WEIGHT_INDICATOR_HEIGHT_REM} + ${FLOATING_STACK_GAP_REM})`
        : "0rem";

  return `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + ${reserved} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})`;
}
