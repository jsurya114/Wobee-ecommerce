import { Card } from "@woobe/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * All copy below is grounded in this codebase's real, currently-implemented
 * rules (returns/resolve-return-eligibility.ts, returns/calculate-return-
 * refund-amount.ts, orders/cancel-order.use-case.ts, the Order/Return/Refund/
 * Payment* enums in schema.prisma) — not invented policy. Anywhere the real
 * business rule isn't actually confirmed yet (flagged in the source itself,
 * e.g. `DECISIONS_PENDING.md #5`'s 7-day return window), a
 * `PendingConfirmationNote` says so explicitly instead of presenting a
 * guessed number as settled policy.
 */

function PendingConfirmationNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-dashed border-border bg-surface-2 p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <p className="font-body text-xs text-text-secondary">{children}</p>
    </div>
  );
}

function PolicyRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-body text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-0.5 font-body text-sm text-text-secondary">{children}</p>
    </div>
  );
}

function HelpLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-4 py-3 font-body text-sm font-medium text-text-primary transition-colors hover:bg-surface-2">
      {label}
    </Link>
  );
}

export function RefundPolicyContent() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-text-primary">Refund Policy</h2>
      <Card className="flex flex-col gap-4 p-4">
        <PolicyRow title="When a refund applies">
          A refund is issued once a return request on a delivered order is approved, or if a paid order is cancelled.
        </PolicyRow>
        <PolicyRow title="How much is refunded">
          You&apos;re refunded what you actually paid for the returned item(s) — the item price after any coupon discount you
          received, plus the tax charged on those items. Delivery/shipping charges are not refunded.
        </PolicyRow>
        <PolicyRow title="How you're refunded">
          Card/UPI payments are refunded to the original payment method through our payment gateway. Cash on Delivery orders
          have no online payment to refund automatically, so our support team completes these manually once your return is
          approved.
        </PolicyRow>
      </Card>
      <PendingConfirmationNote>
        The exact refund processing timeline hasn&apos;t been finalized yet — for an update on a specific refund, please
        contact support.
      </PendingConfirmationNote>
    </div>
  );
}

export function ReturnsPolicyContent() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-text-primary">Returns</h2>
      <Card className="flex flex-col gap-4 p-4">
        <PolicyRow title="Eligibility">Only orders marked Delivered can be returned.</PolicyRow>
        <PolicyRow title="Return window">Returns can currently be requested within 7 days of delivery.</PolicyRow>
        <PolicyRow title="How to request a return">
          Open the delivered order under My Orders and use "Request a return" to choose the item(s), quantity, and reason.
        </PolicyRow>
        <PolicyRow title="What happens after you request one">
          Your request moves through: requested → approved (or rejected) → refund initiated → refunded — you can follow this
          on the order&apos;s own page at any time.
        </PolicyRow>
      </Card>
      <PendingConfirmationNote>
        The 7-day return window is a current default, not a confirmed business policy, and the exact return-processing
        timeline hasn&apos;t been finalized — contact support if you&apos;re unsure about a specific order.
      </PendingConfirmationNote>
    </div>
  );
}

export function PaymentsHelpContent() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-text-primary">Payments</h2>
      <Card className="flex flex-col gap-4 p-4">
        <PolicyRow title="Accepted payment methods">Card/UPI through our payment gateway, or Cash on Delivery.</PolicyRow>
        <PolicyRow title="Payment failed at checkout?">
          If a card/UPI payment fails, you haven&apos;t been charged — you can simply try again.
        </PolicyRow>
        <PolicyRow title="Payment shows pending?">
          Online payments are confirmed automatically once your bank/UPI app confirms them — this is normally immediate.
        </PolicyRow>
      </Card>
    </div>
  );
}

export function AccountHelpContent() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-text-primary">Account</h2>
      <Card className="divide-y divide-border overflow-hidden p-0">
        <HelpLinkRow href="/forgot-password" label="Forgot your password?" />
        <HelpLinkRow href="/login" label="Trouble logging in" />
        <HelpLinkRow href="/register" label="Create a new account" />
      </Card>
    </div>
  );
}
