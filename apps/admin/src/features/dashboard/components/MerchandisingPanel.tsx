"use client";

import type { BusinessDashboard } from "@woobe/types";
import { cn } from "@woobe/ui";
import Link from "next/link";
import { useState } from "react";
import { inr, inrShort, int, kg } from "../lib/format";
import { HorizontalBars } from "./charts/HorizontalBars";
import { Panel, PanelEmpty } from "./ui/Panel";

type Metric = "sales" | "units" | "kg";
const TOP_N = 6;
const TABS: { value: Metric; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "units", label: "Units" },
  { value: "kg", label: "Kg" },
];

export function MerchandisingPanel({ d }: { d: BusinessDashboard }) {
  const [metric, setMetric] = useState<Metric>("sales");
  const [showAll, setShowAll] = useState(false);
  const { categories, bestSellers } = d.merchandising;

  const value = (c: (typeof categories)[number]) => (metric === "sales" ? c.netSalesPaise : metric === "units" ? c.units : c.weightGrams);
  const ranked = [...categories].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name));
  const visible = showAll ? ranked : ranked.slice(0, TOP_N);
  const format = (v: number) => (metric === "sales" ? inrShort(v) : metric === "units" ? int(v) : kg(v));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Top categories"
        info="Categories ranked by realized net sales in the period (after discounts and refunds), with a toggle for units or kilograms sold."
        action={
          <div className="flex gap-0.5 rounded-pill border border-border bg-surface p-0.5" role="group" aria-label="Rank categories by">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={metric === tab.value}
                onClick={() => setMetric(tab.value)}
                className={cn("rounded-pill px-2.5 py-1 font-body text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", metric === tab.value ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      >
        {ranked.length === 0 ? (
          <PanelEmpty title="No category sales in this period" />
        ) : (
          <>
            <HorizontalBars
              ariaLabel={`Top categories by ${metric}`}
              rows={visible.map((c) => ({ key: c.categoryId, label: c.name, value: value(c), sub: metric === "sales" ? `${int(c.units)} units · ${kg(c.weightGrams)}` : metric === "units" ? inr(c.netSalesPaise) : inr(c.netSalesPaise) }))}
              format={format}
            />
            {ranked.length > TOP_N ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 font-body text-xs font-medium text-primary hover:underline">
                {showAll ? "Show top 6" : `View all ${ranked.length} categories`}
              </button>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="Best sellers" info="Products ranked by units sold in the period (net of returns). Sales are after discounts; kg uses the weight recorded on each order." action={<Link href="/products">Products →</Link>}>
        {bestSellers.length === 0 ? (
          <PanelEmpty title="No product sales in this period" />
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[22rem] font-body text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th className="px-1 pb-2 font-medium">Product</th>
                  <th className="px-1 pb-2 text-right font-medium">Units</th>
                  <th className="px-1 pb-2 text-right font-medium">Sales</th>
                  <th className="px-1 pb-2 text-right font-medium">Kg</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((row) => (
                  <tr key={row.productId} className="border-t border-border">
                    <td className="max-w-[12rem] truncate px-1 py-2 text-text-primary" title={row.name}>
                      <Link href={`/products/${row.productId}`} className="hover:text-primary hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">{int(row.units)}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{inrShort(row.netSalesPaise)}</td>
                    <td className="px-1 py-2 text-right tabular-nums text-text-secondary">{kg(row.weightGrams)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
