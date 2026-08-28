import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Mirrors Input's exact styling — the first multi-line text field this app needs (Week 2 Day 4's review body), added now rather than hand-rolled once, same "arrives when a real feature needs it" policy packages/ui's own index.ts states for Dialog/Select. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid}
    className={cn(
      "min-h-24 w-full rounded-control border bg-surface px-4 py-2.5 font-body text-base text-text-primary placeholder:text-text-secondary",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      invalid ? "border-error" : "border-border",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
