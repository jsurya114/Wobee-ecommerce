"use client";

import { Card } from "@woobe/ui";
import { ChevronLeft, ChevronRight, CreditCard, MessageCircle, Package, RotateCcw, UserCircle, Search, Wallet } from "lucide-react";
import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import { ContactSupportSection } from "./ContactSupportSection";
import { HelpOrderQueries } from "./HelpOrderQueries";
import { AccountHelpContent, PaymentsHelpContent, RefundPolicyContent, ReturnsPolicyContent } from "./HelpTopicContent";

type Screen = "hub" | "orders" | "returns" | "refunds" | "payments" | "account" | "contact";

interface Topic {
  screen: Exclude<Screen, "hub">;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  /** Extra match terms for the search box — the "Common help topics" phrases from the brief, folded into whichever tile actually covers them rather than each becoming its own tile/action. */
  keywords: string;
}

const TOPICS: Topic[] = [
  {
    screen: "orders",
    icon: Package,
    title: "Orders & Delivery",
    description: "Track orders, delivery status and order issues",
    keywords: "where is my order order status shipping information delivery issues cancel an order tracking",
  },
  {
    screen: "returns",
    icon: RotateCcw,
    title: "Returns",
    description: "Learn about returns and eligibility",
    keywords: "return an item return policy return eligibility",
  },
  {
    screen: "refunds",
    icon: Wallet,
    title: "Refunds",
    description: "Understand refund processing and timelines",
    keywords: "refund information refund status refund policy money back",
  },
  {
    screen: "payments",
    icon: CreditCard,
    title: "Payments",
    description: "Payment-related assistance",
    keywords: "payment issues payment failed razorpay cash on delivery cod",
  },
  {
    screen: "account",
    icon: UserCircle,
    title: "Account",
    description: "Login and account assistance",
    keywords: "account login issues password reset forgot password sign in google",
  },
  {
    screen: "contact",
    icon: MessageCircle,
    title: "Contact Support",
    description: "Contact customer support",
    keywords: "contact support email whatsapp help",
  },
];

/**
 * Help & Support hub (replaces the old Account → Help & Support direct-
 * mailto link — see AccountView.tsx). A simple in-page screen switch, the
 * same convention `RegisterForm`/`ForgotPasswordForm` already use for a
 * multi-step flow, rather than a new route per topic. All business logic
 * (order data, status, return eligibility) lives in the existing API/use-
 * cases this page's children call into — nothing here decides order
 * status or return eligibility itself.
 */
export function HelpSupportPage() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [query, setQuery] = useState("");

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((topic) => `${topic.title} ${topic.description} ${topic.keywords}`.toLowerCase().includes(q));
  }, [query]);

  if (screen !== "hub") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <button
          type="button"
          onClick={() => setScreen("hub")}
          className="flex items-center gap-1 self-start font-body text-sm font-medium text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Help &amp; Support
        </button>

        {screen === "orders" ? <HelpOrderQueries /> : null}
        {screen === "returns" ? <ReturnsPolicyContent /> : null}
        {screen === "refunds" ? <RefundPolicyContent /> : null}
        {screen === "payments" ? <PaymentsHelpContent /> : null}
        {screen === "account" ? <AccountHelpContent /> : null}
        {screen === "contact" ? <ContactSupportSection /> : null}

        {screen !== "contact" ? (
          <button
            type="button"
            onClick={() => setScreen("contact")}
            className="self-start font-body text-sm font-medium text-primary hover:underline"
          >
            Still need help? Contact support →
          </button>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="font-display text-xl text-text-primary">Help &amp; Support</h1>
        <p className="mt-1 font-body text-sm text-text-secondary">Find answers about your orders, returns, refunds and more.</p>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
        <input
          type="search"
          id="help-search"
          name="help-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          aria-label="Search help"
          className="h-11 w-full rounded-control border border-border bg-surface pl-10 pr-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>

      <div>
        <p className="mb-1.5 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Common topics</p>
        {filteredTopics.length === 0 ? (
          <p className="px-1 font-body text-sm text-text-secondary">
            No results for that search — try something else, or contact support directly.
          </p>
        ) : (
          <Card className="divide-y divide-border overflow-hidden p-0">
            {filteredTopics.map(({ screen: s, icon: Icon, title, description }) => (
              <button
                key={s}
                type="button"
                onClick={() => setScreen(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-sm font-medium text-text-primary">{title}</span>
                  <span className="block truncate font-body text-xs text-text-secondary">{description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              </button>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}
