import { Loader2 } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "default" | "lg";
}

const SIZES = { sm: "h-4 w-4", default: "h-5 w-5", lg: "h-8 w-8" } as const;

/** Inline async-state indicator — used wherever `Button`'s own `isLoading` prop isn't the right shape (a bare loading row, not a button). */
export function Spinner({ className, size = "default", ...props }: SpinnerProps) {
  return (
    <span role="status" aria-label="Loading" className={cn("inline-flex text-primary", className)} {...props}>
      <Loader2 className={cn("animate-spin", SIZES[size])} />
    </span>
  );
}
