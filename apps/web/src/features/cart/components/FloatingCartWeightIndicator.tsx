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
 * Compact, persistent, ambient cart-weight pill (UI refinement pass;
 * liquid-glass redesign 2026-09-03) — the mobile-only floating counterpart
 * to the full inline `WeightThresholdBanner` shown on the cart page itself.
 * `position: fixed` handles staying visible through scroll on its own; no
 * scroll listener anywhere in this component. Reacts to `useCart()`'s
 * already-reactive state, so it updates the instant a mutation resolves
 * (add/update/remove) — no polling either.
 *
 * The progress-toward-threshold fill is a translucent layer sized by
 * `status.percent` (the same server-derived value `WeightThresholdBanner`'s
 * `ProgressBar` uses) sitting behind the text, rather than a separate bar
 * stacked underneath — keeps the pill's height compact while still making
 * the progress legible at a glance.
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
  const fillPercent = isFreeDelivery ? 100 : Math.min(100, Math.max(0, status.percent));

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-3 z-20 flex items-center gap-2 overflow-hidden rounded-pill border border-white/60 py-1.5 pl-1.5 pr-3 shadow-modal backdrop-blur-xl md:hidden",
        isFreeDelivery ? "bg-success/10" : "bg-surface/70",
      )}
      style={{ bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})` }}
    >
      <div
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isFreeDelivery ? "bg-success/10" : "bg-primary/10")}
        style={{ width: `${fillPercent}%` }}
      />

      <span
        className={cn(
          "relative flex h-8 shrink-0 items-center justify-center rounded-full px-2 font-body text-[11px] font-bold",
          isFreeDelivery ? "bg-success/15 text-success" : "bg-primary-tint text-primary",
        )}
      >
        {isFreeDelivery ? <PackageCheck className="h-4 w-4" aria-hidden="true" /> : formatGrams(cart.weightBasedTotalGrams)}
      </span>

      <span className="relative min-w-0 flex-1 truncate font-body text-xs font-medium text-text-primary">{message}</span>

      <Link href="/cart" aria-label="View Bag" className="relative flex shrink-0 items-center text-primary">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
