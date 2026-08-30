import { formatGrams, formatPaiseAsInr, formatPaiseAsInrCompact } from "@woobe/utils";
import { cn } from "../lib/cn";

export interface PriceTagProps {
  pricePaise: number;
  /** Cheapest active variant's weight (grams). Pass together with `ratePerKgPaise` to show the weight·rate line. `null`/`undefined` hides it. */
  weightGrams?: number | null;
  /** Effective rate per kg (paise), server-resolved. */
  ratePerKgPaise?: number | null;
  /**
   * "sm"  — card / rail / search result (default)
   * "md"  — cart line subtotal
   * "lg"  — PDP main price
   */
  size?: "sm" | "md" | "lg";
  /** Prepend a lowercase "from " (a multi-variant "from ₹449"). */
  from?: boolean;
  className?: string;
}

/**
 * The weight → rate/kg → price triple — Woobe's pricing mechanic made
 * visible on every product surface (redesign spec §E). Always fed
 * server-computed numbers (DEVELOPMENT_RULES.md #1); this component never
 * computes a price. Typeface is Inter across every size — the serif is
 * reserved for the wordmark and the PDP product name.
 */
export function PriceTag({ pricePaise, weightGrams, ratePerKgPaise, size = "sm", from = false, className }: PriceTagProps) {
  const showRate = weightGrams != null && ratePerKgPaise != null;
  const priceClass =
    size === "lg"
      ? "text-[1.75rem] leading-tight lg:text-3xl"
      : size === "md"
        ? "text-base"
        : "text-[0.9375rem] lg:text-base";
  const rateClass = size === "lg" ? "text-xs lg:text-sm" : "text-micro lg:text-xs";

  return (
    <div className={cn("flex flex-col", size === "lg" ? "gap-1" : "gap-0.5", className)}>
      <p className={cn("font-body font-semibold text-text-primary", priceClass)}>
        {from ? <span className="font-normal text-text-secondary">from </span> : null}
        {formatPaiseAsInr(pricePaise)}
      </p>
      {showRate ? (
        <p className={cn("font-body text-text-secondary", rateClass)}>
          {formatGrams(weightGrams)} · {formatPaiseAsInrCompact(ratePerKgPaise)}/kg
        </p>
      ) : null}
    </div>
  );
}

/** Redesign alias — same component, spec name. */
export const PriceBlock = PriceTag;
