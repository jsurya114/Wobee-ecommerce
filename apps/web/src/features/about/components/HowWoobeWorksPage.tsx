import { Card } from "@woobe/ui";
import { Gem, PackageCheck, Scale, Sparkles, Truck } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface Section {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    icon: Sparkles,
    title: "Surplus, not seasonal",
    body:
      "Every piece on Woobe is surplus women's fashion — stock sourced outside the usual retail cycle rather than a single brand's current collection. What's live today is genuinely what's available; it isn't restaged from a catalogue.",
  },
  {
    icon: Scale,
    title: "Weight-based pricing",
    body:
      "Price is calculated from the item's actual weight against our current rate per kilogram, not a fixed sticker price. You'll see the weight and rate behind the price on every product, so the number is always traceable back to something real.",
  },
  {
    icon: Gem,
    title: "Limited, sometimes one-off",
    body:
      "Because stock is surplus, many pieces exist in only one size, or a small handful. A style you see today may sell out and not come back — we don't promise a restock, and treat that scarcity as part of what makes each find worth it.",
  },
  {
    icon: PackageCheck,
    title: "We pack it ourselves",
    body:
      "Once you order, our own warehouse team picks, checks, and packs it — this isn't outsourced to a third-party fulfilment service. Your order's status moves through our system as it happens, not an estimate.",
  },
  {
    icon: Truck,
    title: "Courier handoff",
    body:
      "Once packed, your order is handed to a courier partner for delivery. You can follow it from your account at any point after handoff — tracking details appear there as soon as they're available.",
  },
];

/**
 * "How Woobe Works" (hamburger menu → About Woobe, 2026-09-11) — the one
 * genuinely new page this feature adds. Every claim here is grounded in the
 * real business model and existing app behavior (weight-based pricing
 * already shown per-product, the PACKED/SHIPPED order-status checkpoints,
 * `order.carrier`/`order.trackingNumber`) — no invented SLAs, restock
 * promises, or discounts.
 */
export function HowWoobeWorksPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 md:py-14">
      <div className="mb-8 text-center md:mb-10">
        <h1 className="font-display text-3xl text-primary md:text-4xl">How Woobe Works</h1>
        <p className="mx-auto mt-3 max-w-md font-body text-sm text-text-secondary">
          Woobe is a surplus women's fashion marketplace — here's what that actually means, from pricing to your doorstep.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {SECTIONS.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="flex gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-body text-sm font-semibold text-text-primary">{title}</h2>
              <p className="mt-1 font-body text-sm text-text-secondary">{body}</p>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
