"use client";

import type { BusinessDashboard } from "@woobe/types";
import { colors } from "@woobe/ui";
import { int, pct, shortDate } from "../lib/format";
import { TimeSeriesChart, type ChartPoint } from "./charts/TimeSeriesChart";
import { Panel, Stat } from "./ui/Panel";

/** Traffic and customer mix. Visitors are tracked SESSIONS (from first-party events) — never inferred from API request counts. */
export function CustomersTrafficPanel({ d }: { d: BusinessDashboard }) {
  const c = d.customers;
  const { bucket } = d.period;
  const label = (date: string) => ({ label: shortDate(date), title: bucket === "week" ? `Week of ${shortDate(date, true)}` : shortDate(date, true) });
  const sessionPoints: ChartPoint[] = d.sales.series.map((p) => ({ ...label(p.date), values: { sessions: p.sessions } }));
  const orderPoints: ChartPoint[] = d.sales.series.map((p) => ({ ...label(p.date), values: { orders: p.orders } }));
  const hasTraffic = d.sales.series.some((p) => p.sessions > 0);
  const hasOrders = d.sales.series.some((p) => p.orders > 0);

  return (
    <Panel
      title="Customer & store traffic"
      info="Visitors = anonymous browsing sessions recorded by the storefront (one per browser visit, not per person). Buyers = customers with a realized order; new = their first-ever order fell in the period, returning = they had ordered before. Repeat = 2+ realized orders in the period."
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Visitors" value={c.visitors > 0 ? int(c.visitors) : "0"} hint="sessions" />
          <Stat label="Buyers" value={int(c.buyers)} />
          <Stat label="New customers" value={int(c.newBuyers)} hint="first order in period" />
          <Stat label="Returning" value={int(c.returningBuyers)} hint="ordered before" />
          <Stat label="Repeat rate" value={pct(c.repeatRatePct)} hint={`${int(c.repeatBuyers)} with 2+ orders`} />
          <Stat label="Conversion" value={pct(d.funnel.overallConversionPct)} hint="sessions → orders" />
        </div>
        {hasTraffic || hasOrders ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-1 font-body text-xs font-medium text-text-secondary">Visitors (sessions)</p>
              <TimeSeriesChart points={sessionPoints} series={[{ key: "sessions", label: "Sessions", color: "#786D68", kind: "area", format: (v) => int(v) }]} axisFormat={(v) => int(v)} height={160} ariaLabel={`Visitor sessions per ${bucket}`} />
            </div>
            <div>
              <p className="mb-1 font-body text-xs font-medium text-text-secondary">Orders</p>
              <TimeSeriesChart points={orderPoints} series={[{ key: "orders", label: "Orders", color: colors.brand.primary, kind: "bar", format: (v) => int(v) }]} axisFormat={(v) => int(v)} height={160} ariaLabel={`Orders per ${bucket}`} />
            </div>
          </div>
        ) : (
          <p className="rounded-control bg-surface-2/60 px-4 py-6 text-center font-body text-sm text-text-secondary">No traffic or orders in this period.</p>
        )}
      </div>
    </Panel>
  );
}
