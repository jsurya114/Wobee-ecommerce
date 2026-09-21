import type { BusinessDashboard } from "@woobe/types";
import Link from "next/link";
import { DASH, inrShort, int, kg, pct } from "../lib/format";
import { HorizontalBars } from "./charts/HorizontalBars";
import { Panel, PanelEmpty, Stat } from "./ui/Panel";

/** "Where is my money sitting?" — stock at COST (never selling price), plus units, weight, sell-through and low-stock counts. */
export function InventoryPanel({ d }: { d: BusinessDashboard }) {
  const inv = d.inventory;
  const costKnown = (inv.costCoveragePct ?? 0) > 0;
  const byValue = costKnown && inv.byCategory.some((c) => c.valueAtCostPaise > 0);

  return (
    <Panel
      title="Inventory overview"
      info="A snapshot of stock on hand right now (not period-scoped). Value is at recorded COST — cost per kg × weight for weight-priced products, per-piece cost for fixed-price ones. Stock without a configured cost is left out of the value and reflected in the coverage figure. Retail value (current selling price) is shown separately."
    >
      {inv.units === 0 ? (
        <PanelEmpty title="No stock on hand" hint="Inventory appears here once products have stock." action={<Link href="/inventory">Go to inventory →</Link>} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Value at cost"
              value={costKnown ? inrShort(inv.valueAtCostPaise) : DASH}
              hint={costKnown ? `cost known for ${pct(inv.costCoveragePct, 0)} of units` : "cost not configured"}
            />
            <Stat label="Retail value" value={inrShort(inv.retailValuePaise)} hint="at current prices" info="Selling-price value of stock on hand. This is what it would sell for, not what it cost." />
            <Stat label="Units" value={int(inv.units)} />
            <Stat label="Weight" value={kg(inv.weightGrams)} />
            <Stat
              label="Sell-through"
              value={pct(inv.sellThroughPct)}
              info="Units sold in the period (net of returns) ÷ (units sold + units on hand now). Higher means stock is moving faster."
            />
            <Stat
              label="Low stock SKUs"
              value={int(inv.lowStockSkus)}
              tone={inv.lowStockSkus > 0 ? "warn" : "default"}
              hint={inv.outOfStockSkus > 0 ? `${int(inv.outOfStockSkus)} out of stock` : undefined}
              info="Active variants with fewer than 10 sellable units (available minus reserved) but at least 1."
            />
          </div>

          <div>
            <p className="mb-2 font-body text-xs font-medium text-text-secondary">{byValue ? "Inventory value by category (at cost)" : "Units on hand by category"}</p>
            {inv.byCategory.length === 0 ? (
              <p className="font-body text-sm text-text-secondary">No categorised stock.</p>
            ) : (
              <HorizontalBars
                ariaLabel={byValue ? "Inventory value by category" : "Inventory units by category"}
                rows={[...inv.byCategory]
                  .sort((a, b) => (byValue ? b.valueAtCostPaise - a.valueAtCostPaise : b.units - a.units))
                  .slice(0, 8)
                  .map((c) => ({ key: c.categoryId, label: c.name, value: byValue ? c.valueAtCostPaise : c.units, sub: `${int(c.units)} units · ${kg(c.weightGrams)}` }))}
                format={byValue ? inrShort : (v) => int(v)}
                barClassName="bg-[#786D68]"
              />
            )}
            {!byValue ? <p className="mt-2 font-body text-xs text-text-secondary">Set product costs to see where your money is sitting.</p> : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
