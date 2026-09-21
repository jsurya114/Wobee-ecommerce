import type { BusinessFunnel } from "@woobe/types";
import { cn } from "@woobe/ui";
import { int, pct } from "../../lib/format";

/**
 * Sequential conversion funnel (Shopify's principle: each stage is a subset of
 * the previous, so the drop-off between stages is the story). Bar width is the
 * stage's share of visitors; between stages a connector states the step-to-step
 * drop-off. Counts are SESSIONS (labelled), never mixed with people/orders.
 */
export function FunnelChart({ funnel }: { funnel: BusinessFunnel }) {
  const { steps } = funnel;
  return (
    <ol className="flex flex-col" aria-label="Conversion funnel">
      {steps.map((step, i) => {
        const width = step.pctOfVisitors === null ? 0 : Math.max(step.count > 0 ? 3 : 0, step.pctOfVisitors);
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key}>
            {i > 0 ? (
              <div className="flex items-center gap-2 py-1 pl-1 font-body text-xs text-text-secondary" aria-hidden={step.dropOffPct === null}>
                <span className="text-text-secondary/60">↓</span>
                {step.stepConversionPct === null ? (
                  <span>no sessions reached the previous step</span>
                ) : (
                  <span>
                    {pct(step.stepConversionPct)} continue · <span className={cn(step.dropOffPct !== null && step.dropOffPct >= 50 ? "text-[#B45309]" : "")}>{pct(step.dropOffPct)} drop off</span>
                  </span>
                )}
              </div>
            ) : null}
            {/* Narrow screens: label on its own line above the bar. sm+: label | bar | share on one row. */}
            <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem] sm:items-center sm:gap-3">
              <p className="font-body text-sm text-text-primary sm:truncate" title={step.label}>
                {step.label}
              </p>
              <div className="flex items-center gap-3 sm:contents">
                <div className="h-9 min-w-0 flex-1 overflow-hidden rounded-control bg-surface-2">
                  <div
                    className={cn("flex h-full items-center rounded-control px-2.5 font-body text-sm font-semibold tabular-nums text-white", isLast ? "bg-success" : "bg-primary")}
                    style={{ width: `${width}%`, opacity: isLast ? 1 : 1 - i * 0.12, minWidth: step.count > 0 ? `${Math.max(2.25, 1.5 + int(step.count).length * 0.62)}rem` : 0 }}
                    title={`${step.label}: ${int(step.count)}`}
                  >
                    {int(step.count)}
                  </div>
                </div>
                <p className="w-[5.5rem] shrink-0 text-right font-body text-xs text-text-secondary sm:w-auto">
                  <span className="block text-sm font-medium tabular-nums text-text-primary">{i === 0 ? "100%" : pct(step.pctOfVisitors)}</span>
                  of visitors
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
