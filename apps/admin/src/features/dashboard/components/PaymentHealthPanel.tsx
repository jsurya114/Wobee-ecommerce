import type { BusinessDashboard } from "@woobe/types";
import { inr, int, pct } from "../lib/format";
import { HorizontalBars } from "./charts/HorizontalBars";
import { Panel, PanelEmpty, Stat } from "./ui/Panel";

export function PaymentHealthPanel({ d }: { d: BusinessDashboard }) {
  const p = d.payments;
  return (
    <Panel
      title="Payment issues"
      info="Failed online payment attempts reported by Razorpay in the period (one per unique gateway event, so retried webhooks never double-count). Reasons are grouped into a fixed set; anything the gateway doesn't classify shows as “Unknown / other”. Failure rate = failed ÷ (failed + successful) attempts."
    >
      {p.failedAttempts === 0 ? (
        <PanelEmpty
          title="No payment failures"
          hint={p.successfulPayments > 0 ? `${int(p.successfulPayments)} successful online payment${p.successfulPayments === 1 ? "" : "s"} in this period.` : "No online payment activity in this period."}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-8">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:content-start lg:gap-4">
            <Stat label="Failed payments" value={int(p.failedAttempts)} tone="warn" />
            <Stat label="Failure rate" value={pct(p.failureRatePct)} hint={`${int(p.successfulPayments)} succeeded`} />
            <Stat label="Failed amount" value={inr(p.failedAmountPaise)} info="Sum of the attempted amounts. Customers often retry, so this is not lost revenue." />
          </div>
          <div>
            <p className="mb-2 font-body text-xs font-medium text-text-secondary">Why payments failed</p>
            <HorizontalBars
              ariaLabel="Payment failure reasons"
              rows={p.reasons.map((r) => ({ key: r.reason, label: r.label, value: r.count, sub: `${pct(r.pct, 0)} of failures` }))}
              format={(v) => int(v)}
              barClassName="bg-[#B45309]"
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
