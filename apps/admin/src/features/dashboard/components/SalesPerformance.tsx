"use client";

import type { BusinessDashboard } from "@woobe/types";
import { colors } from "@woobe/ui";
import Link from "next/link";
import { inr, inrAxis, int, kg, pct, shortDate } from "../lib/format";
import { TimeSeriesChart, type ChartPoint, type ChartSeries } from "./charts/TimeSeriesChart";
import { Panel, PanelEmpty } from "./ui/Panel";

function pointLabel(date: string, bucket: "day" | "week") {
  return { label: shortDate(date), title: bucket === "week" ? `Week of ${shortDate(date, true)}` : shortDate(date, true) };
}

const hasSales = (d: BusinessDashboard) => d.sales.series.some((p) => p.netSalesPaise !== 0 || p.orders > 0);

/** Sales & Profit (large time series) beside the financial breakdown, then Orders & Weight underneath. */
export function SalesPerformance({ d }: { d: BusinessDashboard }) {
  const { bucket } = d.period;
  const s = d.sales;
  const profitAvailable = d.overview.knownCostProfit.value !== null;

  const moneyPoints: ChartPoint[] = s.series.map((p) => ({
    ...pointLabel(p.date, bucket),
    values: { sales: p.netSalesPaise, profit: p.knownCostProfitPaise },
  }));
  const moneySeries: ChartSeries[] = [
    { key: "sales", label: "Net sales", color: colors.brand.primary, kind: "area", format: inr },
    ...(profitAvailable ? [{ key: "profit", label: "Known-cost profit", color: colors.status.success, kind: "line" as const, format: inr }] : []),
  ];

  const orderPoints: ChartPoint[] = s.series.map((p) => ({ ...pointLabel(p.date, bucket), values: { orders: p.orders } }));
  const weightPoints: ChartPoint[] = s.series.map((p) => ({ ...pointLabel(p.date, bucket), values: { kg: p.weightGrams / 1000 } }));
  const kgFormat = (v: number) => kg(Math.round(v * 1000));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Sales & profit"
          className="lg:col-span-2"
          info={`Net sales per ${bucket} (after discounts and refunds, excl. GST/shipping) and known-cost profit. Weekly buckets start on Monday (IST) for ranges over 45 days.`}
        >
          {!hasSales(d) ? (
            <PanelEmpty title="No sales in this period" hint="Realized sales appear here — online orders once paid, COD orders once delivered and collected." />
          ) : (
            <>
              <TimeSeriesChart points={moneyPoints} series={moneySeries} axisFormat={inrAxis} height={264} ariaLabel={`Net sales${profitAvailable ? " and known-cost profit" : ""} per ${bucket}`} />
              <p className="mt-2 font-body text-xs text-text-secondary">
                {profitAvailable ? (
                  <>
                    Profit uses recorded product cost only · <span className="font-medium text-text-primary">{pct(s.profit.coveragePct, 0)}</span> of net sales have cost data. Excludes {s.profit.excluded.join(", ").toLowerCase()}.
                  </>
                ) : (
                  <>
                    Profit unavailable — cost data not configured.{" "}
                    <Link href="/products" className="font-medium text-primary hover:underline">
                      Set product costs
                    </Link>{" "}
                    to see it.
                  </>
                )}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Sales breakdown"
          info="How gross sales become net sales. Offer discounts are already inside item prices; coupons are applied at checkout. Refunds are cash paid back (they include GST/shipping); the ex-tax value of returned goods is what reduces net sales. GST and shipping are collected but are not sales or profit."
        >
          <dl className="flex flex-col gap-2 font-body text-sm">
            <Row label="Gross sales" value={inr(s.grossSalesPaise)} />
            <Row label="Offer discounts" value={`− ${inr(s.offerDiscountPaise)}`} />
            <Row label="Coupon discounts" value={`− ${inr(s.couponDiscountPaise)}`} />
            <Row label="Returns & refunds (ex-tax)" value={`− ${inr(s.grossSalesPaise - s.offerDiscountPaise - s.couponDiscountPaise - s.netSalesPaise)}`} />
            <div className="my-1 border-t border-border" />
            <Row label="Net sales" value={inr(s.netSalesPaise)} strong />
            <div className="my-1 border-t border-border" />
            <Row label="Shipping collected" value={inr(s.shippingRevenuePaise)} muted />
            <Row label="GST collected" value={inr(s.taxCollectedPaise)} muted />
            <Row label="Cash refunded" value={`${inr(s.refundsPaise)} · ${int(s.refundedOrders)} order${s.refundedOrders === 1 ? "" : "s"}`} muted />
          </dl>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <Mini label="Discount rate" value={pct(s.discountRatePct)} />
            <Mini label="Refund rate" value={pct(s.refundRatePct)} />
            <Mini label="Online / COD" value={s.onlineSharePct === null ? "—" : `${pct(s.onlineSharePct, 0)} / ${pct(100 - s.onlineSharePct, 0)}`} />
          </dl>
        </Panel>
      </div>

      <Panel title="Orders & weight" info="Realized orders and kilograms sold per bucket. Shown on separate axes because they are different units.">
        {!hasSales(d) ? (
          <PanelEmpty title="No orders or weight sold in this period" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-1 font-body text-xs font-medium text-text-secondary">Orders</p>
              <TimeSeriesChart points={orderPoints} series={[{ key: "orders", label: "Orders", color: colors.brand.primary, kind: "bar", format: (v) => int(v) }]} axisFormat={(v) => int(v)} height={170} ariaLabel={`Orders per ${bucket}`} />
            </div>
            <div>
              <p className="mb-1 font-body text-xs font-medium text-text-secondary">Kg sold{s.averageKgPerOrder !== null ? ` · avg ${s.averageKgPerOrder} kg / order` : ""}</p>
              <TimeSeriesChart points={weightPoints} series={[{ key: "kg", label: "Kg sold", color: "#786D68", kind: "area", format: kgFormat }]} axisFormat={(v) => `${Math.round(v * 10) / 10}kg`} height={170} ariaLabel={`Kilograms sold per ${bucket}`} />
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? "text-text-secondary" : "text-text-primary"}>{label}</dt>
      <dd className={strong ? "font-display text-base text-text-primary" : muted ? "tabular-nums text-text-secondary" : "tabular-nums text-text-primary"}>{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-body text-xs text-text-secondary">{label}</dt>
      <dd className="font-body text-sm font-medium tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}
