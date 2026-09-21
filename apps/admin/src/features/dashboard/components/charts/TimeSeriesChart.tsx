"use client";

import { colors } from "@woobe/ui";
import { useMemo, useState } from "react";
import { useElementWidth } from "./useElementWidth";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  kind: "area" | "line" | "bar";
  format: (value: number) => string;
}

export interface ChartPoint {
  /** Short x-axis label. */
  label: string;
  /** Longer label for the hover tooltip. */
  title: string;
  /** null = no data for that point (draws a gap, never a fake zero). */
  values: Record<string, number | null>;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

/** Round axis ticks (1, 2, 2.5, 5 × 10^n steps) that always include 0 and bracket the data, so labels read ₹2K, ₹4K … not ₹1.8K, ₹4.5K. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0, 1];
  const rawStep = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 1000; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

/**
 * Time-series chart (Grafana's rule: time-based data is a line/area, not a
 * categorical bar chart — bars are offered only for discrete counts like
 * orders). One shared x-axis, real-pixel SVG, hover guide + tooltip, and gaps
 * where a value is null (e.g. profit on a day with no cost-covered sales).
 * No point markers except on hover, so a 90-day range stays uncluttered.
 */
export function TimeSeriesChart({
  points,
  series,
  axisFormat,
  height = 240,
  ariaLabel,
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  axisFormat: (value: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const all = points.flatMap((p) => series.map((s) => p.values[s.key])).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    return { ticks, yMin: ticks[0]!, yMax: ticks[ticks.length - 1]! };
  }, [points, series]);

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const band = plotW / Math.max(1, n);
  const x = (i: number) => PAD.left + (i + 0.5) * band;
  const y = (v: number) => PAD.top + plotH - ((v - geometry.yMin) / (geometry.yMax - geometry.yMin)) * plotH;
  const zeroY = y(0);

  const ticks = geometry.ticks;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 84))));
  const xLabelIndices: number[] = [];
  for (let i = 0; i < n; i += labelEvery) xLabelIndices.push(i);
  if (n > 0 && xLabelIndices.at(-1) !== n - 1 && n - 1 - xLabelIndices.at(-1)! >= labelEvery * 0.6) xLabelIndices.push(n - 1);

  const linePath = (key: string): string => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = p.values[key];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const areaPath = (key: string): string => {
    // Filled only across contiguous runs of data, closed to the zero line.
    const runs: string[] = [];
    let run: { i: number; v: number }[] = [];
    const flush = () => {
      if (run.length > 0) {
        const top = run.map((r, idx) => `${idx === 0 ? "M" : "L"}${x(r.i).toFixed(1)},${y(r.v).toFixed(1)}`).join("");
        runs.push(`${top}L${x(run.at(-1)!.i).toFixed(1)},${zeroY.toFixed(1)}L${x(run[0]!.i).toFixed(1)},${zeroY.toFixed(1)}Z`);
      }
      run = [];
    };
    points.forEach((p, i) => {
      const v = p.values[key];
      if (typeof v === "number" && Number.isFinite(v)) run.push({ i, v });
      else flush();
    });
    flush();
    return runs.join("");
  };

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.min(n - 1, Math.max(0, Math.floor((event.clientX - rect.left) / band)));
    setHover(index);
  };

  const hovered = hover !== null ? points[hover] : null;
  const tooltipLeft = hover !== null ? Math.min(Math.max(x(hover), 90), width - 90) : 0;

  return (
    <div ref={ref} className="relative w-full">
      {series.length > 1 ? (
        <ul className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-xs text-text-secondary">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible" onPointerLeave={() => setHover(null)}>
        {/* grid + y-axis labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.border.hairline} strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={colors.text.secondary}>
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {/* x-axis labels — evenly spaced; the last point is added only when it wouldn't crowd the previous label */}
        {xLabelIndices.map((i) => {
          // Labels near either edge anchor inward so they never overhang the container.
          const halfLabel = points[i]!.label.length * 3.4;
          const anchor = x(i) + halfLabel > width - 1 ? "end" : x(i) - halfLabel < 1 ? "start" : "middle";
          const lx = anchor === "end" ? Math.min(x(i) + 4, width - 1) : anchor === "start" ? Math.max(x(i) - 4, 1) : x(i);
          return (
            <text key={i} x={lx} y={height - 8} textAnchor={anchor} fontSize={11} fill={colors.text.secondary}>
              {points[i]!.label}
            </text>
          );
        })}
        {/* series: bars first, then areas, then lines (lines stay readable on top) */}
        {series
          .filter((s) => s.kind === "bar")
          .map((s) =>
            points.map((p, i) => {
              const v = p.values[s.key];
              if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return null;
              const barW = Math.max(2, Math.min(28, band * 0.62));
              const top = Math.min(y(v), zeroY);
              return (
                <rect key={`${s.key}-${i}`} x={x(i) - barW / 2} y={top} width={barW} height={Math.max(1, Math.abs(y(v) - zeroY))} rx={Math.min(3, barW / 2)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
              );
            }),
          )}
        {series
          .filter((s) => s.kind === "area")
          .map((s) => (
            <path key={`${s.key}-area`} d={areaPath(s.key)} fill={s.color} opacity={0.12} />
          ))}
        {series
          .filter((s) => s.kind !== "bar")
          .map((s) => (
            <path key={`${s.key}-line`} d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        {/* hover guide + markers */}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.text.secondary} strokeWidth={1} opacity={0.35} />
            {series
              .filter((s) => s.kind !== "bar")
              .map((s) => {
                const v = points[hover]?.values[s.key];
                return typeof v === "number" ? <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={colors.canvas.surface} stroke={s.color} strokeWidth={2} /> : null;
              })}
          </g>
        ) : null}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
      </svg>
      {hovered ? (
        <div
          className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 rounded-control border border-border bg-surface px-2.5 py-1.5 font-body text-xs shadow-card"
          style={{ left: tooltipLeft }}
        >
          <p className="mb-0.5 font-medium text-text-primary">{hovered.title}</p>
          {series.map((s) => {
            const v = hovered.values[s.key];
            return (
              <p key={s.key} className="flex items-center gap-1.5 text-text-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                {s.label}: <span className="font-medium text-text-primary">{typeof v === "number" ? s.format(v) : "—"}</span>
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
