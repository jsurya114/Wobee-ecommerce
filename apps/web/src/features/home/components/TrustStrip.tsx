import { BadgeCheck, RefreshCw, Scale, ShieldCheck } from "lucide-react";

const ITEMS = [
  { icon: Scale, label: "Transparent pricing", description: "Weight × rate, shown on every product" },
  { icon: BadgeCheck, label: "Real products", description: "What you see is what ships" },
  { icon: RefreshCw, label: "Easy exchanges", description: "Wrong size, no drama" },
  { icon: ShieldCheck, label: "Secure payments", description: "Razorpay-verified, never stored" },
] as const;

/**
 * Trust-signal row (woobe_ui_design_plan.md §8, item 8) — turns the
 * weight-based pricing mechanic into a selling point rather than hiding it,
 * per the doc's own brand direction (§1).
 */
export function TrustStrip() {
  return (
    <section className="border-y border-border bg-surface px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 sm:grid-cols-4">
        {ITEMS.map(({ icon: Icon, label, description }) => (
          <div key={label} className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left">
            <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden="true" />
            <p className="font-body text-sm font-medium text-text-primary">{label}</p>
            <p className="font-body text-xs text-text-secondary">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
