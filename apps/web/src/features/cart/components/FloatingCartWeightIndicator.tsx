"use client";

import { cn } from "@woobe/ui";
import { formatGrams } from "@woobe/utils";
import { ArrowRight, PackageCheck } from "lucide-react";
import Link from "next/link";
import { FLOATING_STACK_GAP_REM, MOBILE_BOTTOM_NAV_HEIGHT_REM } from "@/lib/layout-constants";
import { useCart } from "../hooks/useCart";
import { useCartWeightBarVisibility } from "../hooks/useCartWeightBarVisibility";
import { deriveWeightStatus } from "../lib/derive-weight-status";

/**
 * Compact, persistent, ambient cart-weight pill (UI refinement pass) — the
 * mobile-only floating counterpart to the full inline `WeightThresholdBanner`
 * shown on the cart page itself. `position: fixed` handles staying visible
 * through scroll on its own; no scroll listener anywhere in this component.
 * Reacts to `useCart()`'s already-reactive state, so it updates the instant
 * a mutation resolves (add/update/remove) — no polling either.
 *
 * Deliberately renders nothing (not a skeleton) when `useCartWeightBarVisibility`
 * says no — empty cart, no weight-based items, or a route (cart/checkout/PDP/
 * order-confirmation) that already has its own weight messaging.
 */
export function FloatingCartWeightIndicator() {
  const visible = useCartWeightBarVisibility();
  const { cart } = useCart();

  if (!visible || !cart) return null;

  const status = deriveWeightStatus(cart.weightBasedTotalGrams, cart.shipping);
  if (!status) return null;

  const isFreeDelivery = status.kind === "free-delivery";
  const message = isFreeDelivery
    ? "Free delivery unlocked"
    : status.kind === "below-minimum"
      ? `${formatGrams(status.gramsRemaining)} more to place order`
      : `${formatGrams(status.gramsRemaining)} more for free delivery`;

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-3 z-20 flex items-center gap-2 rounded-pill border py-1.5 pl-1.5 pr-3 shadow-card backdrop-blur-sm md:hidden",
        isFreeDelivery ? "border-success/25 bg-success/10" : "border-border bg-surface/95",
      )}
      style={{ bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})` }}
    >
      <span
        className={cn(
          "flex h-8 shrink-0 items-center justify-center rounded-full px-2 font-body text-[11px] font-bold",
          isFreeDelivery ? "bg-success/15 text-success" : "bg-primary-tint text-primary",
        )}
      >
        {isFreeDelivery ? <PackageCheck className="h-4 w-4" aria-hidden="true" /> : formatGrams(cart.weightBasedTotalGrams)}
      </span>

      <span className="min-w-0 flex-1 truncate font-body text-xs font-medium text-text-primary">{message}</span>

      <Link href="/cart" aria-label="View Bag" className="flex shrink-0 items-center text-primary">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
