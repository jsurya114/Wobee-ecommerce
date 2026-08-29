"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Real accessible radio behavior (Base UI, ADR-022) under Tailwind styling —
 * replaces a raw `<input type="radio">` group. `RadioGroup` provides the
 * shared value/onValueChange state; each `RadioGroupItem` is one option.
 */
export const RadioGroup = BaseRadioGroup;

export interface RadioGroupItemProps extends ComponentPropsWithoutRef<typeof Radio.Root> {
  label: ReactNode;
  description?: ReactNode;
}

/** One selectable option — label/description are part of the clickable target, not just the dot (44px+ tap target, woobe_ui_design_plan.md §12). */
export function RadioGroupItem({ label, description, className, ...props }: RadioGroupItemProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-control border border-border p-4 transition-colors",
        "has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary-tint/40",
        className,
      )}
    >
      <Radio.Root
        {...props}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface data-[checked]:border-primary"
      >
        <Radio.Indicator className="h-2.5 w-2.5 rounded-full bg-primary data-[unchecked]:hidden" />
      </Radio.Root>
      <span className="flex flex-col gap-0.5">
        <span className="font-body text-sm font-medium text-text-primary">{label}</span>
        {description ? <span className="font-body text-xs text-text-secondary">{description}</span> : null}
      </span>
    </label>
  );
}
