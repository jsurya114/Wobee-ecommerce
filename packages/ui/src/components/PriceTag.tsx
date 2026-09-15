import React, { type ReactNode } from "react";
import { formatPaiseAsInrCompact } from "@woobe/utils";

export interface PriceTagProps {
  pricePaise: number;
  compareAtPricePaise?: number | null;
  /** Null for a FIXED-category product (2026-08-31), same as omitting it — see below. */
  weightGrams?: number | null;
  /** Null for a FIXED-category product (2026-08-31) — the weight/rate line simply doesn't render (see below), same as omitting it. */
  ratePerKgPaise?: number | null;
  /**
   * Offer module (2026-09-15) — a short discount pill ("20% OFF", "₹300
   * OFF") to render next to the current price. Callers own the label text
   * (this primitive has no opinion on discount-type formatting, only
   * layout) — see apps/web's `OfferBadge` for the one place that string is
   * actually built. Kept `undefined`/omitted when no offer applies; this
   * component never fabricates a badge on its own.
   */
  discountBadge?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * The current price and its `discountBadge` share the FIRST row (the
 * dominant, "what you pay" line); `compareAtPricePaise` — when it's actually
 * higher than the current price — gets its OWN row underneath, never
 * crammed onto the same line. This split (2026-09-15, offer-filtering pass)
 * replaced an earlier single-row layout that could wrap awkwardly
 * mid-badge on narrow cards once a discount pill joined the price +
 * strikethrough on one line — see ProductCard's own narrow (3-column
 * mobile grid) card, the layout this was actually reported against.
 */
export const PriceTag: React.FC<PriceTagProps> = ({
  pricePaise,
  compareAtPricePaise,
  weightGrams,
  ratePerKgPaise,
  discountBadge,
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "text-[12px]",
    md: "text-[14px]",
    lg: "text-[18px]",
  };

  const ratePerKg = ratePerKgPaise ? Math.round(ratePerKgPaise / 100) : null;
  const hasDiscount = Boolean(compareAtPricePaise && compareAtPricePaise > pricePaise);

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`font-bold text-text-primary tracking-tight ${sizeClasses[size]}`}>
          {formatPaiseAsInrCompact(pricePaise)}
        </span>
        {discountBadge}
      </div>

      {hasDiscount && (
        <span className="text-[10px] text-text-secondary line-through">{formatPaiseAsInrCompact(compareAtPricePaise!)}</span>
      )}

      {weightGrams != null && ratePerKg !== null && (
        <span className="text-[10px] text-text-secondary font-normal leading-none">
          {weightGrams}g • ₹{ratePerKg}/kg
        </span>
      )}
    </div>
  );
};
