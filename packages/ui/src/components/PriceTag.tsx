import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { cn } from "../lib/cn";

export interface PriceTagProps {
  pricePaise: number;
  weightGrams?: number;
  ratePerKgPaise?: number;
  /** "display" for card-sized contexts (listing), "detail" for the larger PDP treatment. */
  size?: "display" | "detail";
  className?: string;
}

/**
 * The weight → rate/kg → price triple (ADR-022's own component inventory,
 * woobe_ui_design_plan.md §1) — Woobe's pricing mechanic made visible, not
 * decoration. Every price shown to a customer goes through this, always fed
 * server-computed numbers (DEVELOPMENT_RULES.md #1) — this component never
 * computes a price itself.
 */
export function PriceTag({ pricePaise, weightGrams, ratePerKgPaise, size = "display", className }: PriceTagProps) {
  return (
    <div className={cn("flex flex-col", size === "detail" ? "gap-1" : "gap-0.5", className)}>
      <p className={cn("font-display text-text-primary", size === "detail" ? "text-3xl" : "text-base font-medium")}>
        {formatPaiseAsInr(pricePaise)}
      </p>
      {weightGrams !== undefined && ratePerKgPaise !== undefined ? (
        <p className="font-body text-xs text-text-secondary">
          {formatGrams(weightGrams)} · {formatPaiseAsInr(ratePerKgPaise)}/kg
        </p>
      ) : null}
    </div>
  );
}
