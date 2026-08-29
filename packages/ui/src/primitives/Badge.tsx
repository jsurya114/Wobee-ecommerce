import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-body text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-primary-tint text-text-primary",
      success: "bg-success/15 text-success",
      error: "bg-error/10 text-error",
      outline: "border border-border text-text-secondary",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** Pill status label (in-stock, order status, free-delivery) — woobe_ui_design_plan.md §5's pill radius pattern. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";
