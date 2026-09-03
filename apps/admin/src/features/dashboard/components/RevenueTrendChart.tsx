"use client";

import { formatPaiseAsInrCompact } from "@woobe/utils";
import { Card, SectionHeader } from "@woobe/ui";
import { useState } from "react";
import type { DailyRevenuePoint } from "../api/dashboard.client";

const CHART_HEIGHT = 140;
const BAR_GAP_RATIO = 0.28; // fraction of each column's width left as a gap between bars

/**
 * Single-series magnitude-over-time — one hue, no legend (the title names
 * the series; dataviz skill's own rule for a single series), thin bars
 * with rounded data-ends, a per-bar hover tooltip (the skill's own
 * "ship the hover layer by default" rule). No shared library — one
 * dashboard chart doesn't warrant a new dependency.
 */
export function RevenueTrendChart({ points }: { points: DailyRevenuePoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return null;
  }

  const maxRevenue = Math.max(1, ...points.map((p) => p.revenuePaise));
  const columnWidth = 100 / points.length;
  const barWidth = columnWidth * (1 - BAR_GAP_RATIO);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  // A handful of x-axis labels, not one per bar (avoids label collision on a 30/90-day range).
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <Card flat className="p-4">
      <SectionHeader>Revenue, last {points.length} days</SectionHeader>
      <div className="relative">
        {hovered ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs shadow-card"
            style={{ left: `${hoverIndex! * columnWidth + columnWidth / 2}%`, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-medium text-text-primary">{formatPaiseAsInrCompact(hovered.revenuePaise)}</p>
            <p className="text-text-secondary">
              {formatChartDate(hovered.date)} · {hovered.orderCount} order{hovered.orderCount === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}
        <svg
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-36 w-full overflow-visible"
          role="img"
          aria-label={`Daily revenue for the last ${points.length} days, ranging from 0 to ${formatPaiseAsInrCompact(maxRevenue)}`}
        >
          <line x1="0" y1={CHART_HEIGHT - 1} x2="100" y2={CHART_HEIGHT - 1} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {points.map((point, i) => {
            const barHeight = (point.revenuePaise / maxRevenue) * (CHART_HEIGHT - 8);
            return (
              <rect
                key={point.date}
                x={i * columnWidth + (columnWidth - barWidth) / 2}
                y={CHART_HEIGHT - 1 - barHeight}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={1.5}
                className={hoverIndex === i ? "fill-primary" : "fill-primary/70"}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex((current) => (current === i ? null : current))}
              >
                <title>
                  {formatChartDate(point.date)}: {formatPaiseAsInrCompact(point.revenuePaise)}
                </title>
              </rect>
            );
          })}
        </svg>
        <div className="mt-1 flex font-body text-[10px] text-text-secondary">
          {points.map((point, i) => (
            <span key={point.date} style={{ width: `${columnWidth}%` }} className="shrink-0 text-center">
              {i % labelEvery === 0 ? formatChartDate(point.date) : ""}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function formatChartDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
