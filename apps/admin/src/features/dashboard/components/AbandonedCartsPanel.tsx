import type { BusinessDashboard } from "@woobe/types";
import { inrShort, int, pct } from "../lib/format";
import { Panel, PanelEmpty, Stat } from "./ui/Panel";

export function AbandonedCartsPanel({ d }: { d: BusinessDashboard }) {
  const a = d.abandonedCarts;
  return (
    <Panel
      title="Abandoned carts"
      info={`A cart that holds at least one item, has no order, and has been untouched for ${a.inactivityHours}+ hours. Empty carts are ignored. Rate = abandoned ÷ (abandoned + orders placed). Value is at CURRENT prices, since carts don't record a price.`}
    >
      {a.count === 0 ? (
        <PanelEmpty title="No abandoned carts" hint={`No cart with items sat idle for ${a.inactivityHours}+ hours in this period.`} />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Carts" value={int(a.count)} tone="warn" />
          <Stat label="Est. value" value={inrShort(a.estimatedValuePaise)} hint="at current prices" />
          <Stat label="Abandonment" value={pct(a.ratePct)} />
        </div>
      )}
    </Panel>
  );
}
