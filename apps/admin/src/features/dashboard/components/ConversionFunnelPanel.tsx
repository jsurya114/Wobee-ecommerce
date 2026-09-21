import type { BusinessDashboard } from "@woobe/types";
import { pct } from "../lib/format";
import { FunnelChart } from "./charts/FunnelChart";
import { Panel, PanelEmpty, Stat } from "./ui/Panel";

/** Full-width sequential funnel. Steps are sessions (defined in the tooltip), never mixed with people or orders. */
export function ConversionFunnelPanel({ d }: { d: BusinessDashboard }) {
  const f = d.funnel;
  return (
    <Panel
      title="Conversion funnel"
      info="Sessions that started in the period, followed step by step: visited → viewed a product → added to cart → started checkout → placed an order (paid online, or confirmed for COD; failed and cancelled orders don't count). Each step includes only sessions that completed the one before. A session is one anonymous browsing visit — not a person."
    >
      {!f.hasData ? (
        <PanelEmpty title="No storefront sessions tracked in this period" hint="Visits are recorded from the moment tracking went live. Customers who block tracking (Do Not Track) aren't counted." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <FunnelChart funnel={f} />
          <div className="flex flex-row gap-6 border-t border-border pt-4 lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <Stat label="Overall conversion" value={pct(f.overallConversionPct)} hint="orders ÷ visitors" info="Orders placed divided by all sessions in the period." />
            <Stat label="Checkout completion" value={pct(f.checkoutCompletionPct)} hint="orders ÷ started checkout" info="Of the sessions that started checkout, the share that placed an order." />
          </div>
        </div>
      )}
    </Panel>
  );
}
