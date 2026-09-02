import { PricingSettingsForm } from "@/features/settings/components/PricingSettingsForm";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">Settings</h1>
      <PricingSettingsForm />
    </div>
  );
}
