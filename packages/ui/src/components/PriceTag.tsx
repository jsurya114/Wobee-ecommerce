import React from "react";
import { formatPaiseAsInrCompact } from "@woobe/utils";

export interface PriceTagProps {
  pricePaise: number;
  compareAtPricePaise?: number | null;
  /** Null for a FIXED-category product (2026-08-31), same as omitting it — see below. */
  weightGrams?: number | null;
  /** Null for a FIXED-category product (2026-08-31) — the weight/rate line simply doesn't render (see below), same as omitting it. */
  ratePerKgPaise?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const PriceTag: React.FC<PriceTagProps> = ({
  pricePaise,
  compareAtPricePaise,
  weightGrams,
  ratePerKgPaise,
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "text-[12px]",
    md: "text-[14px]",
    lg: "text-[18px]",
  };

  const ratePerKg = ratePerKgPaise ? Math.round(ratePerKgPaise / 100) : null;

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`font-bold text-[#1A1513] tracking-tight ${sizeClasses[size]}`}>
          {formatPaiseAsInrCompact(pricePaise)}
        </span>
        {compareAtPricePaise && compareAtPricePaise > pricePaise && (
          <span className="text-[10px] text-[#9C928B] line-through">
            {formatPaiseAsInrCompact(compareAtPricePaise)}
          </span>
        )}
      </div>

      {weightGrams != null && ratePerKg !== null && (
        <span className="text-[10px] text-[#6E6560] font-normal leading-none">
          {weightGrams}g • ₹{ratePerKg}/kg
        </span>
      )}
    </div>
  );
};
