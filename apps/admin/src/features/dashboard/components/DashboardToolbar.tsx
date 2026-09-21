"use client";

import type { DashboardCompare, DashboardRange } from "@woobe/types";
import { Button, cn } from "@woobe/ui";
import { useState } from "react";
import type { BusinessDashboard, DashboardSelection } from "../api/dashboard.client";
import { dateRangeLabel } from "../lib/format";
import { RANGE_PRESETS } from "../lib/presets";

/** Today's IST date as YYYY-MM-DD — the upper bound for the custom range pickers. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The single control that drives EVERY panel: a preset (or custom range) and
 * the comparison mode. Changing it changes one query, so no panel can show a
 * different period from another. The caption always states the exact resolved
 * dates (and the comparison window), so "Last 30 days" is never ambiguous.
 */
export function DashboardToolbar({
  selection,
  onChange,
  period,
  updating,
}: {
  selection: DashboardSelection;
  onChange: (next: DashboardSelection) => void;
  period: BusinessDashboard["period"] | undefined;
  updating: boolean;
}) {
  const [draftFrom, setDraftFrom] = useState(selection.from ?? "");
  const [draftTo, setDraftTo] = useState(selection.to ?? "");
  const max = todayIst();
  const draftValid = draftFrom !== "" && draftTo !== "" && draftFrom <= draftTo;

  const pickRange = (range: DashboardRange) => {
    if (range === "custom") {
      const to = selection.to ?? max;
      const from = selection.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      setDraftFrom(from);
      setDraftTo(to);
      onChange({ ...selection, range: "custom", from, to });
    } else {
      onChange({ range, compare: selection.compare });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-text-primary">Dashboard</h1>
          <p className="font-body text-sm text-text-secondary" aria-live="polite">
            {period ? (
              <>
                {dateRangeLabel(period.current.from, period.current.to)}
                {period.previous ? <span className="text-text-secondary/80"> · vs {dateRangeLabel(period.previous.from, period.previous.to)}</span> : null}
                <span className="text-text-secondary/60"> · IST</span>
              </>
            ) : (
              "Loading…"
            )}
            {updating ? <span className="ml-2 text-xs text-primary">Updating…</span> : null}
          </p>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-pill border border-border bg-surface p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Date range">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                aria-pressed={selection.range === preset.value}
                onClick={() => pickRange(preset.value)}
                className={cn(
                  "shrink-0 rounded-pill px-2 py-1.5 font-body text-xs font-medium sm:px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selection.range === preset.value ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 font-body text-xs text-text-secondary">
            <span className="sr-only sm:not-sr-only">Compare</span>
            <select
              value={selection.compare}
              onChange={(e) => onChange({ ...selection, compare: e.target.value as DashboardCompare })}
              className="h-8 rounded-pill border border-border bg-surface px-3 font-body text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="previous">vs previous period</option>
              <option value="none">No comparison</option>
            </select>
          </label>
        </div>
      </div>

      {selection.range === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftValid) onChange({ range: "custom", compare: selection.compare, from: draftFrom, to: draftTo });
          }}
        >
          <label className="flex flex-col gap-1 font-body text-xs text-text-secondary">
            From
            <input type="date" value={draftFrom} max={max} onChange={(e) => setDraftFrom(e.target.value)} className="h-9 rounded-control border border-border bg-surface px-2 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
          <label className="flex flex-col gap-1 font-body text-xs text-text-secondary">
            To
            <input type="date" value={draftTo} max={max} onChange={(e) => setDraftTo(e.target.value)} className="h-9 rounded-control border border-border bg-surface px-2 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
          <Button type="submit" size="sm" disabled={!draftValid}>
            Apply
          </Button>
          {draftFrom !== "" && draftTo !== "" && !draftValid ? <p className="font-body text-xs text-error">The start date is after the end date.</p> : null}
        </form>
      ) : null}
    </div>
  );
}
