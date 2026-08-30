import { RefreshCw, Scale, ShieldCheck } from "lucide-react";

const ITEMS = [
  { icon: Scale, label: "Weight × rate, shown on every product" },
  { icon: RefreshCw, label: "Easy exchanges" },
  { icon: ShieldCheck, label: "Secure payments" },
] as const;

/**
 * A single thin trust line (redesign spec §B/§L) — shrunk from the old
 * mid-page 4-up block and moved down near the footer, so it supports the
 * shopping flow instead of interrupting it. Full-bleed background, one row.
 */
export function TrustStrip() {
  return (
    <section className="border-y border-border bg-surface px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center sm:justify-between">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-body text-xs text-text-secondary">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
