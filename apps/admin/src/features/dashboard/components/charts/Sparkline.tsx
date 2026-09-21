/**
 * A tiny, axis-less trend line for a KPI card. Draws nothing for < 2 usable
 * points or a flat series (no fake trend). Missing points are skipped and the
 * line joins its neighbours — this is a glanceable trend cue, while the main
 * chart is where gaps are shown honestly.
 */
export function Sparkline({ values, color, width = 84, height = 28 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => typeof p.v === "number" && Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  if (max === min) return null;
  const step = width / Math.max(1, values.length - 1);
  const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${(p.i * step).toFixed(1)},${(height - 2 - ((p.v - min) / (max - min)) * (height - 4)).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
