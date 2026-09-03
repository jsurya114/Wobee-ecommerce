"use client";

import { buttonVariants, cn } from "@woobe/ui";
import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { ArrowRight, PackageCheck } from "lucide-react";
import Link from "next/link";
import { FLOATING_STACK_GAP_REM, MOBILE_BOTTOM_NAV_HEIGHT_REM } from "@/lib/layout-constants";
import type { CartView } from "../api/cart.client";
import { deriveWeightStatus, type WeightStatus } from "../lib/derive-weight-status";

/**
 * Mobile-only unified purchase surface for the Bag page (2026-09-04) — one
 * liquid-glass dock combining the weight/free-shipping progress row with
 * the total + checkout action row, replacing the two previously-separate
 * pieces (the inline `WeightThresholdBanner` card and a checkout-only
 * floating bar). `CartPageContent` is the only caller, and it hides its own
 * inline `WeightThresholdBanner` on mobile (`hidden md:block`) so the
 * progress never renders twice on this page — desktop keeps that inline
 * banner as its one and only weight display, since desktop has no floating
 * dock at all.
 *
 * The weight row only renders when the cart actually has weight-based
 * items (`deriveWeightStatus` returns non-null) — a FIXED-price-only cart
 * gets just the checkout row, shorter. `useWhatsAppBottomOffset` mirrors
 * this exact condition to pick the matching dock-height constant, so
 * WhatsApp's own clearance never drifts from what's actually rendered here.
 */
export function CheckoutDock({ cart, payableTotal }: { cart: CartView; payableTotal: number }) {
  const status = deriveWeightStatus(cart.weightBasedTotalGrams, cart.shipping);

  return (
    <div
      className="fixed inset-x-3 z-20 overflow-hidden rounded-card border border-white/50 bg-surface/80 shadow-modal backdrop-blur-xl md:hidden"
      style={{ bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})` }}
    >
      {status ? <WeightProgressRow status={status} weightBasedTotalGrams={cart.weightBasedTotalGrams} /> : null}
      <CheckoutActionRow payableTotal={payableTotal} meetsMinimum={cart.shipping.meetsMinimum} hasRowAbove={status !== null} />
    </div>
  );
}

/**
 * Same message/progress-fill logic as the standalone `FloatingCartWeightIndicator`
 * (Home/Shop) — kept as a plain inline row here rather than its own
 * bordered/shadowed pill, since the outer `CheckoutDock` already supplies
 * the one glass surface for both rows.
 */
function WeightProgressRow({ status, weightBasedTotalGrams }: { status: WeightStatus; weightBasedTotalGrams: number }) {
  const isFreeDelivery = status.kind === "free-delivery";
  const message = isFreeDelivery
    ? "Free delivery unlocked"
    : status.kind === "below-minimum"
      ? `${formatGrams(status.gramsRemaining)} more to checkout`
      : `${formatGrams(status.gramsRemaining)} to unlock free shipping`;
  const fillPercent = isFreeDelivery ? 100 : Math.min(100, Math.max(0, status.percent));

  return (
    <div role="status" className={cn("relative flex items-center gap-2 overflow-hidden px-3 pb-2 pt-2.5", isFreeDelivery && "bg-success/10")}>
      <div
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isFreeDelivery ? "bg-success/10" : "bg-primary/10")}
        style={{ width: `${fillPercent}%` }}
      />
      <span
        className={cn(
          "relative flex h-7 shrink-0 items-center justify-center rounded-full px-2 font-body text-[11px] font-bold",
          isFreeDelivery ? "bg-success/15 text-success" : "bg-primary-tint text-primary",
        )}
      >
        {isFreeDelivery ? <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> : formatGrams(weightBasedTotalGrams)}
      </span>
      <span className="relative min-w-0 flex-1 truncate font-body text-xs font-medium text-text-primary">{message}</span>
    </div>
  );
}

function CheckoutActionRow({
  payableTotal,
  meetsMinimum,
  hasRowAbove,
}: {
  payableTotal: number;
  meetsMinimum: boolean;
  hasRowAbove: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", hasRowAbove && "border-t border-border/50")}>
      <span className="pl-1 font-body text-lg font-bold text-text-primary">{formatPaiseAsInr(payableTotal)}</span>
      <Link
        href="/checkout"
        aria-disabled={!meetsMinimum}
        className={cn(buttonVariants(), "ml-auto flex-1 gap-1.5 rounded-pill", !meetsMinimum && "pointer-events-none opacity-50")}
      >
        Checkout
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
