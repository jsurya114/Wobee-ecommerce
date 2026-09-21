import { cn } from "@woobe/ui";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { signedPct } from "../../lib/format";

/**
 * Period-over-period change. Renders nothing when comparison is off, and a
 * muted "no prior data" when it is on but the previous period was zero/empty —
 * the API sends `deltaPct: null` there because a change from zero is undefined
 * (never "+Infinity%"). `higherIsBetter=false` flips the colour for metrics
 * where a rise is bad (e.g. RTO).
 */
export function DeltaBadge({ deltaPct, comparisonOn, higherIsBetter = true }: { deltaPct: number | null; comparisonOn: boolean; higherIsBetter?: boolean }) {
  if (!comparisonOn) return null;
  if (deltaPct === null) {
    return <span className="font-body text-xs text-text-secondary/80">no prior data</span>;
  }
  const flat = Math.abs(deltaPct) < 0.05;
  const up = deltaPct > 0;
  const good = flat ? null : up === higherIsBetter;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 font-body text-xs font-medium",
        good === null && "bg-surface-2 text-text-secondary",
        good === true && "bg-success/10 text-success",
        good === false && "bg-error/10 text-error",
      )}
      aria-label={`${signedPct(deltaPct)} versus the previous period`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {signedPct(deltaPct)}
    </span>
  );
}
