"use client";

import { usePathname } from "next/navigation";
import { useCart } from "@/features/cart/hooks/useCart";
import { useCartWeightBarVisibility } from "@/features/cart/hooks/useCartWeightBarVisibility";
import {
  CART_CHECKOUT_DOCK_HEIGHT_REM,
  CART_WEIGHT_INDICATOR_HEIGHT_REM,
  FLOATING_STACK_GAP_REM,
  MOBILE_BOTTOM_NAV_HEIGHT_REM,
  PDP_PURCHASE_DOCK_HEIGHT_REM,
  STICKY_ACTION_BAR_HEIGHT_REM,
} from "@/lib/layout-constants";

/**
 * The one place that knows what else is currently occupying the bottom of
 * the mobile viewport, so `WhatsAppButton` can clear it — a route's floating
 * action dock and the standalone cart-weight pill are mutually exclusive
 * (see `useCartWeightBarVisibility`'s own doc comment), so at most one of
 * them is ever reserved at a time. Pure route/cart-state derivation, no
 * scroll listener.
 *
 * The PDP purchase dock and the cart checkout dock (2026-09-04, both now
 * unified glass surfaces — `ProductPurchasePanel`, `CheckoutDock`) FLOAT
 * their own `FLOATING_STACK_GAP_REM` above the nav dock rather than sitting
 * flush against it, same as the standalone weight pill — that gap has to be
 * folded into `reserved` here too, or this hook's own trailing
 * `+ FLOATING_STACK_GAP_REM` (WhatsApp's clearance above whichever bar is
 * reserved) lands exactly on that bar's own top edge with zero space
 * between them (confirmed live, 2026-09-03, for the weight pill before that
 * fix; both docks need the identical treatment since they float the same
 * way). Each dock's own height also varies with whether it renders its
 * weight-progress row — `hasWeightRow` mirrors the exact same
 * `weightBasedTotalGrams > 0` condition both `CheckoutDock` and
 * `ProductPurchasePanel` use for that, so this can never drift from what
 * either dock actually renders.
 */
export function useWhatsAppBottomOffset(): string {
  const pathname = usePathname();
  const showsCartWeightBar = useCartWeightBarVisibility();
  // Only actually read on `/cart`/`/products/[slug]`, but hooks can't be
  // called conditionally.
  const { cart } = useCart();
  const hasWeightRow = Boolean(cart && cart.weightBasedTotalGrams > 0);

  let reserved: string;
  if (pathname === "/cart") {
    reserved = `calc(${hasWeightRow ? CART_CHECKOUT_DOCK_HEIGHT_REM : STICKY_ACTION_BAR_HEIGHT_REM} + ${FLOATING_STACK_GAP_REM})`;
  } else if (pathname?.startsWith("/products/")) {
    reserved = `calc(${hasWeightRow ? PDP_PURCHASE_DOCK_HEIGHT_REM : STICKY_ACTION_BAR_HEIGHT_REM} + ${FLOATING_STACK_GAP_REM})`;
  } else if (showsCartWeightBar) {
    reserved = `calc(${CART_WEIGHT_INDICATOR_HEIGHT_REM} + ${FLOATING_STACK_GAP_REM})`;
  } else {
    reserved = "0rem";
  }

  return `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + ${reserved} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})`;
}
