import type { LabelHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("font-body text-sm font-medium text-text-primary", className)} {...props} />
  ),
);
Label.displayName = "Label";
