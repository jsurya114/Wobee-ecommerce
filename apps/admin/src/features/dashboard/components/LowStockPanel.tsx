import type { BusinessDashboard } from "@woobe/types";
import Link from "next/link";
import { DASH, inrShort, kg } from "../lib/format";
import { Panel, PanelEmpty } from "./ui/Panel";

export function LowStockPanel({ d }: { d: BusinessDashboard }) {
  const rows = d.inventory.lowStock;
  const total = d.inventory.lowStockSkus;
  return (
    <Panel
      title="Low stock"
      info="Active variants with fewer than 10 sellable units. Value is the on-hand stock at recorded cost (— if no cost is set)."
      action={<Link href="/inventory">View inventory →</Link>}
    >
      {rows.length === 0 ? (
        <PanelEmpty title="Nothing running low" hint="Every active variant is comfortably stocked." />
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[24rem] font-body text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th className="px-1 pb-2 font-medium">Product</th>
                  <th className="px-1 pb-2 text-right font-medium">Left</th>
                  <th className="px-1 pb-2 text-right font-medium">Weight</th>
                  <th className="px-1 pb-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.variantId} className="border-t border-border">
                    <td className="max-w-[13rem] px-1 py-2">
                      <Link href={`/products/${row.productId}`} className="block truncate text-text-primary hover:text-primary hover:underline" title={row.productName}>
                        {row.productName}
                      </Link>
                      <span className="block truncate text-xs text-text-secondary">
                        {row.color} · {row.size} · {row.sku}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-right font-medium tabular-nums text-error">{row.sellable}</td>
                    <td className="px-1 py-2 text-right tabular-nums text-text-secondary">{kg(row.weightGrams)}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{row.valueAtCostPaise === null ? DASH : inrShort(row.valueAtCostPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > rows.length ? <p className="mt-2 font-body text-xs text-text-secondary">+{total - rows.length} more</p> : null}
        </>
      )}
    </Panel>
  );
}
