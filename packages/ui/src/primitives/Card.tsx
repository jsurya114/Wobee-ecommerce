import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Drops the shadow/border for a flatter, inline surface (e.g. a card nested inside another card). */
  flat?: boolean;
}

/** Domain-agnostic surface container (ARCHITECTURE.md §4.1, woobe_ui_design_plan.md §5) — the base every product card, form panel, and summary block builds on. */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, flat, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-card bg-surface",
      flat ? "border border-border" : "border border-border shadow-card",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 p-5", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("font-display text-lg text-text-primary", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0 first:pt-5", className)} {...props} />
));
CardContent.displayName = "CardContent";
