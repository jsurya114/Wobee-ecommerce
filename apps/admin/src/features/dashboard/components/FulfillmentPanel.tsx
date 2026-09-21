import type { BusinessDashboard } from "@woobe/types";
import Link from "next/link";
import { inr, int, pct } from "../lib/format";
import { StackedBar, type StackSegment } from "./charts/StackedBar";
import { Panel, Stat } from "./ui/Panel";

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "#D6CBC6",
  CONFIRMED: "#E3BCC5",
  PROCESSING: "#CF94A2",
  PACKED: "#BD6F82",
  SHIPPED: "#A54659",
  DELIVERED: "#4F684C",
  RETURNED_TO_ORIGIN: "#D97706",
  CANCELLED: "#9B918C",
  PAYMENT_FAILED: "#AE423D",
};

/** Order outcomes (stacked bar) beside delivery health — RTO is visible but not alarmist. */
export function FulfillmentPanel({ d }: { d: BusinessDashboard }) {
  const f = d.fulfillment;
  const segments: StackSegment[] = f.statuses.map((s) => ({ key: s.status, label: s.label, count: s.count, color: STATUS_COLORS[s.status] ?? "#9B918C" }));
  const totalOrders = segments.reduce((n, s) => n + s.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Order fulfillment" info="Every order placed in the period, by its status right now.">
        {totalOrders === 0 ? (
          <p className="py-6 text-center font-body text-sm text-text-secondary">No orders were placed in this period.</p>
        ) : (
          <StackedBar segments={segments} ariaLabel="Orders by status" />
        )}
      </Panel>

      <Panel
        title="Delivery health"
        info="Based on orders SHIPPED in the period and where they stand now. RTO / failed delivery = orders that reached “Returned to origin”; the data holds no courier failure reasons, so none are shown. Recent shipments may still be in transit."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Stat label="Delivered" value={int(f.delivered)} hint={`of ${int(f.shipped)} shipped`} />
          <Stat
            label="RTO / failed delivery"
            value={int(f.rtoOrders)}
            tone={f.rtoOrders > 0 ? "warn" : "default"}
            hint={f.rtoOrders > 0 ? `${inr(f.rtoValuePaise)} order value` : "none in period"}
            info="Orders returned to origin after a failed delivery. Value is the order total at risk."
          />
          <Stat label="RTO rate" value={pct(f.rtoRatePct)} tone={f.rtoRatePct !== null && f.rtoRatePct >= 10 ? "warn" : "default"} info="Returned-to-origin orders divided by orders shipped." />
          <Stat label="Delivery success" value={pct(f.deliverySuccessRatePct)} info="Delivered ÷ (delivered + returned to origin) — only shipments with a final outcome." hint={f.inTransit > 0 ? `${int(f.inTransit)} in transit` : undefined} />
          <Stat label="COD outstanding" value={inr(f.codOutstandingPaise)} hint={`${int(f.codOutstandingOrders)} order${f.codOutstandingOrders === 1 ? "" : "s"} · as of now`} info="Cash-on-delivery orders confirmed but not yet delivered and collected. Delivered-and-collected COD is not counted." />
          <Stat
            label="Returns to review"
            value={
              f.pendingReturns > 0 ? (
                <Link href="/returns" className="text-primary hover:underline">
                  {int(f.pendingReturns)}
                </Link>
              ) : (
                "0"
              )
            }
            hint="customer returns · as of now"
          />
        </div>
      </Panel>
    </div>
  );
}
