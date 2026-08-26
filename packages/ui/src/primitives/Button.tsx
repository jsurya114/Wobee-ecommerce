import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

/** Exported so a non-`<button>` element (e.g. a Next.js `Link` styled as a button/CTA) can share the exact same classes without an `asChild`/Slot indirection this primitive doesn't implement. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "border border-border bg-surface text-text-primary hover:bg-primary-tint",
        ghost: "text-text-primary hover:bg-primary-tint",
      },
      size: {
        default: "h-11 px-5 text-base", // 44px — mobile tap-target minimum (design plan §12)
        sm: "h-9 px-4 text-sm",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";
