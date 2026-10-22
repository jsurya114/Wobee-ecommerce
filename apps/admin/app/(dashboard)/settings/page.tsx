import { BudgetTilesForm } from "@/features/settings/components/BudgetTilesForm";
import { CartShippingSettingsForm } from "@/features/settings/components/CartShippingSettingsForm";
import { PricingSettingsForm } from "@/features/settings/components/PricingSettingsForm";
import { ProductPresetsForm } from "@/features/settings/components/ProductPresetsForm";
import { StorePoliciesForm } from "@/features/settings/components/StorePoliciesForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

const SECTIONS = [
  { id: "settings-pricing", label: "Pricing" },
  { id: "settings-cart-shipping", label: "Cart & shipping" },
  { id: "settings-presets", label: "Product presets" },
  { id: "settings-budget", label: "Shop by budget" },
  { id: "settings-policies", label: "Store policies" },
] as const;

/**
 * Anchor wrapper only (2026-09-29 admin UX pass): each form card already carries
 * its own title, so the old uppercase heading above it just repeated it. The
 * jump links at the top replace it for getting around this long page.
 */
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageHeader title="Settings" description="Store-wide pricing, shipping rules, product presets, homepage budget tiles and policies." />
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-pill border border-border bg-surface px-3 py-1 font-body text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>
      <Section id="settings-pricing">
        <PricingSettingsForm />
      </Section>
      <Section id="settings-cart-shipping">
        <CartShippingSettingsForm />
      </Section>
      <Section id="settings-presets">
        <ProductPresetsForm />
      </Section>
      <Section id="settings-budget">
        <BudgetTilesForm />
      </Section>
      <Section id="settings-policies">
        <StorePoliciesForm />
      </Section>
    </div>
  );
}
