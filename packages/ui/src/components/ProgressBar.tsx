"use client";

import { Progress } from "@base-ui/react/progress";
import { cn } from "../lib/cn";

export interface ProgressBarProps {
  /** Current value, 0–100. */
  value: number;
  label?: string;
  className?: string;
  /** Fill color — defaults to primary; pass "success" once a threshold is fully cleared. */
  tone?: "primary" | "success";
}

/**
 * Real accessible progress semantics (Base UI, ADR-022) — powers the
 * two-stage weight-threshold indicator (woobe_ui_design_plan.md §8.2).
 * `Progress.Indicator` sets its own width from `value`, so styling is just
 * track background + indicator fill color.
 */
export function ProgressBar({ value, label, className, tone = "primary" }: ProgressBarProps) {
  return (
    <Progress.Root value={Math.max(0, Math.min(100, value))} className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Progress.Label className="font-body text-xs font-medium text-text-primary">{label}</Progress.Label>
      ) : null}
      <Progress.Track className="h-2 overflow-hidden rounded-pill bg-primary-tint">
        <Progress.Indicator
          className={cn(
            "h-full rounded-pill transition-[width] duration-300 ease-out",
            tone === "success" ? "bg-success" : "bg-primary",
          )}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
