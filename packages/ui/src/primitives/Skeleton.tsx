import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** Loading placeholder — reserves the real content's space so nothing jumps in once it arrives (woobe_ui_design_plan.md §12 / UX perf guidance: no content-jumping). Replaces bare "Loading…" text everywhere. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-control bg-primary-tint/60", className)} {...props} />;
}
