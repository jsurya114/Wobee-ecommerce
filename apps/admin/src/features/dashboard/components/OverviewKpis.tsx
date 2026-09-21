import type { BusinessDashboard } from "@woobe/types";
import { colors, cn } from "@woobe/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { DASH, inrShort, int, kgValue, pct } from "../lib/format";
import { Sparkline } from "./charts/Sparkline";
import { DeltaBadge } from "./ui/DeltaBadge";
import { InfoTip } from "./ui/InfoTip";

interface KpiCardProps {
  label: string;
  /** Shorter label for narrow (2-column mobile) cards, where the full uppercase label would truncate. */
  labelShort?: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  info: ReactNode;
  delta?: { deltaPct: number | null; comparisonOn: boolean };
  spark?: (number | null)[];
  sparkColor?: string;
  emphasis?: boolean;
  muted?: boolean;
  className?: string;
  infoAlign?: "left" | "right";
}

function KpiCard({ label, labelShort, value, unit, hint, info, delta, spark, sparkColor = colors.brand.primary, emphasis, muted, className, infoAlign }: KpiCardProps) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between rounded-card border border-border bg-surface p-4", emphasis && "shadow-card", className)}>
      <div>
        <p className="flex items-center gap-1 font-body text-xs font-medium uppercase tracking-wide text-text-secondary">
          {labelShort ? (
            <>
              <span className="truncate sm:hidden">{labelShort}</span>
              <span className="hidden truncate sm:inline">{label}</span>
            </>
          ) : (
            <span className="truncate">{label}</span>
          )}
          <InfoTip label={label} align={infoAlign}>
            {info}
          </InfoTip>
        </p>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className={cn("min-w-0 truncate font-display leading-tight", emphasis ? "text-2xl sm:text-3xl" : "text-xl", muted ? "text-text-secondary" : "text-text-primary")}>
            {value}
            {unit && value !== DASH ? <span className="ml-1 font-body text-xs font-normal text-text-secondary">{unit}</span> : null}
          </p>
          {spark ? <Sparkline values={spark} color={sparkColor} /> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-text-secondary">
        {delta ? <DeltaBadge deltaPct={delta.deltaPct} comparisonOn={delta.comparisonOn} /> : null}
        {hint ? <span className="min-w-0">{hint}</span> : null}
      </div>
    </div>
  );
}

/**
 * The compact headline grid. Two primary cards (net sales, profit) lead, the
 * rest are secondary — deliberately not eight identical tiles. Every figure is
 * a server-computed value; this only formats. A metric that can't be computed
 * honestly (no cost data, no traffic, no weight) shows "—" plus WHY, never 0.
 */
export function OverviewKpis({ d }: { d: BusinessDashboard }) {
  const o = d.overview;
  const comparisonOn = d.period.compare === "previous" && d.period.previous !== null;
  const series = d.sales.series;
  const coverage = d.sales.profit.coveragePct;
  const profitKnown = o.knownCostProfit.value !== null;

  return (
    <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-12">
      <KpiCard
        emphasis
        className="col-span-2 lg:col-span-3"
        label="Net sales"
        value={inrShort(o.netSales.value)}
        info="Sales after discounts and refunds, excluding GST and shipping. Only realized sales count: online orders once paid, COD orders once delivered and paid. Cancelled, failed and returned-to-origin orders are excluded."
        delta={{ deltaPct: o.netSales.deltaPct, comparisonOn }}
        spark={series.map((p) => p.netSalesPaise)}
        hint={`${int(o.orders.value)} orders`}
      />
      <KpiCard
        emphasis
        className="col-span-2 lg:col-span-3"
        label="Net profit (known costs)"
        value={profitKnown ? inrShort(o.knownCostProfit.value) : DASH}
        muted={!profitKnown}
        info={
          <>
            Net sales of products with a recorded cost, minus that product cost. <strong>Included:</strong> {d.sales.profit.included.join("; ")}. <strong>Not included:</strong> {d.sales.profit.excluded.join("; ")} — none are recorded yet, so this is a contribution figure, not true net profit.
          </>
        }
        delta={profitKnown ? { deltaPct: o.knownCostProfit.deltaPct, comparisonOn } : undefined}
        spark={profitKnown ? series.map((p) => p.knownCostProfitPaise) : undefined}
        sparkColor={colors.status.success}
        hint={
          profitKnown ? (
            `Profit data ${pct(coverage, 0)} complete`
          ) : coverage === null ? (
            // No realized sales at all — nothing to compute a profit on (not a cost-data problem).
            "No sales in this period"
          ) : (
            <>
              Cost data not configured. <Link href="/products" className="font-medium text-primary hover:underline">Add product costs</Link>
            </>
          )
        }
      />
      <KpiCard
        className="lg:col-span-2"
        label="Orders"
        value={int(o.orders.value)}
        info="Realized orders in the period (online paid + COD delivered and collected)."
        delta={{ deltaPct: o.orders.deltaPct, comparisonOn }}
      />
      <KpiCard
        className="lg:col-span-2"
        label="Avg. order value"
        labelShort="Avg. order"
        value={inrShort(o.averageOrderValue.value)}
        info="Net sales divided by realized orders. Excludes GST and shipping."
        delta={{ deltaPct: o.averageOrderValue.deltaPct, comparisonOn }}
      />
      <KpiCard
        className="lg:col-span-2"
        label="Kg sold"
        value={kgValue(o.kgSold.value)}
        info="Total weight sold: each order item's weight at the time of sale (not today's product weight) × quantity, for realized sales, minus items returned and refunded."
        delta={{ deltaPct: o.kgSold.deltaPct, comparisonOn }}
      />
      <KpiCard
        className="lg:col-span-4"
        label="Revenue / kg"
        value={o.revenuePerKg.value === null ? DASH : inrShort(o.revenuePerKg.value)}
        unit="/kg"
        info="Net sales divided by kilograms sold. Shown as — when no weight was sold."
        delta={{ deltaPct: o.revenuePerKg.deltaPct, comparisonOn }}
      />
      <KpiCard
        className="lg:col-span-4"
        label="Conversion"
        value={o.conversionRate.value === null ? DASH : pct(o.conversionRate.value)}
        info="Share of storefront sessions that placed an order (session-based funnel: visit → product view → cart → checkout → order). Shown as — when no sessions were tracked."
        delta={{ deltaPct: o.conversionRate.deltaPct, comparisonOn }}
        hint={o.conversionRate.value === null ? "No tracked sessions yet" : "sessions → orders"}
        infoAlign="right"
      />
      <KpiCard
        className="col-span-2 lg:col-span-4"
        label="Inventory at cost"
        value={o.inventoryValueAtCost.value === null ? DASH : inrShort(o.inventoryValueAtCost.value)}
        muted={o.inventoryValueAtCost.value === null}
        info="Current on-hand stock valued at recorded cost (cost/kg × weight, or per-piece cost). Stock with no configured cost is excluded and shown in the coverage note — this is not the retail value."
        hint={
          o.inventoryValueAtCost.value === null
            ? d.inventory.units === 0
              ? "No stock on hand"
              : "Cost data not configured"
            : `Cost known for ${pct(o.inventoryCoveragePct, 0)} of units`
        }
        infoAlign="right"
      />
    </section>
  );
}
