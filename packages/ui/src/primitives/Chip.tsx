import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Pill control shared by the category rail, collection pills, budget chips
 * and filter toggles (redesign spec §K) — consolidates the three
 * near-identical hand-rolled pill styles that lived in CategoryFilter /
 * CollectionFilter / FiltersPanel. Exported as `chipVariants` so a
 * `next/link` can wear the same classes without an `asChild` indirection.
 */
export const chipVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill border font-body text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
  {
    variants: {
      active: {
        true: "border-primary bg-primary text-white",
        false: "border-border text-text-primary hover:border-primary hover:bg-primary-tint",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
      },
    },
    defaultVariants: { active: false, size: "md" },
  },
);

export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">,
    VariantProps<typeof chipVariants> {}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(({ className, active, size, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={active ?? false}
    className={cn(chipVariants({ active, size }), className)}
    {...props}
  />
));
Chip.displayName = "Chip";
