import { CartShippingSettingsForm } from "@/features/settings/components/CartShippingSettingsForm";
import { PricingSettingsForm } from "@/features/settings/components/PricingSettingsForm";
import { ProductPresetsForm } from "@/features/settings/components/ProductPresetsForm";
import { StorePoliciesForm } from "@/features/settings/components/StorePoliciesForm";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-body text-xs font-medium uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-xl text-text-primary">Settings</h1>
      <Section id="settings-pricing" title="Pricing">
        <PricingSettingsForm />
      </Section>
      <Section id="settings-cart-shipping" title="Cart & shipping rules">
        <CartShippingSettingsForm />
      </Section>
      <Section id="settings-presets" title="Product presets">
        <ProductPresetsForm />
      </Section>
      <Section id="settings-policies" title="Store policies">
        <StorePoliciesForm />
      </Section>
    </div>
  );
}
