import { int } from "../../lib/format";

export interface StackSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

/** A single horizontal stacked bar (order outcomes) with a legend that carries the exact counts — the legend, not tiny in-bar labels, keeps small segments readable. */
export function StackedBar({ segments, ariaLabel }: { segments: StackSegment[]; ariaLabel: string }) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-pill bg-surface-2" role="img" aria-label={`${ariaLabel}: ${segments.filter((s) => s.count > 0).map((s) => `${s.label} ${s.count}`).join(", ")}`}>
        {total > 0
          ? segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.key} className="h-full first:rounded-l-pill last:rounded-r-pill" style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${int(s.count)}`} />
              ))
          : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2 font-body text-xs text-text-secondary">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums text-text-primary">{int(s.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
