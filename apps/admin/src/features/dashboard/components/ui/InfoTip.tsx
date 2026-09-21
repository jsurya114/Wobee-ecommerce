"use client";

import { cn } from "@woobe/ui";
import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * A definition tooltip for a metric (the brief: every non-obvious financial
 * metric states its assumptions instead of hiding them). Opens on hover AND on
 * keyboard focus / tap, closes on blur or Escape, and is announced through
 * aria-describedby — so it works without a mouse. `align` keeps the bubble
 * on-screen for controls near the right edge.
 */
export function InfoTip({ label, children, align = "left" }: { label: string; children: ReactNode; align?: "left" | "right" | "center" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="rounded-full p-0.5 text-text-secondary/70 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute top-full z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-control border border-border bg-surface p-3 text-left font-body text-xs font-normal normal-case leading-relaxed tracking-normal text-text-primary shadow-modal",
            align === "left" && "left-0",
            align === "right" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
