import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid}
    className={cn(
      "h-11 w-full rounded-control border bg-surface px-4 font-body text-base text-text-primary placeholder:text-text-secondary",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      invalid ? "border-error" : "border-border",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
