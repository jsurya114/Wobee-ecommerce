import { cn } from "@woobe/ui";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Secondary text shown under the label (e.g. "12 units"). */
  sub?: string;
  color?: string;
}

/**
 * Ranked horizontal bars for categorical comparison (top categories, payment
 * failure reasons, inventory by category). Pure CSS — labels never clip
 * (they truncate with the full text in `title`), and bar length is relative to
 * the largest value shown so the biggest row always fills the track.
 */
export function HorizontalBars({
  rows,
  format,
  barClassName = "bg-primary",
  ariaLabel,
}: {
  rows: BarRow[];
  format: (value: number) => string;
  barClassName?: string;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5" aria-label={ariaLabel}>
      {rows.map((row) => {
        const width = max > 0 ? Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100) : 0;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="truncate font-body text-sm text-text-primary" title={row.label}>
                {row.label}
              </p>
              {row.sub ? <p className="truncate font-body text-xs text-text-secondary">{row.sub}</p> : null}
            </div>
            <div className="h-2.5 overflow-hidden rounded-pill bg-surface-2" role="presentation">
              <div className={cn("h-full rounded-pill", barClassName)} style={{ width: `${width}%`, backgroundColor: row.color }} />
            </div>
            <p className="min-w-[4.5rem] text-right font-body text-sm font-medium tabular-nums text-text-primary">{format(row.value)}</p>
          </li>
        );
      })}
    </ul>
  );
}
