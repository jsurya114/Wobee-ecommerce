import { NewOfferForm } from "@/features/offers/components/NewOfferForm";

export default function NewOfferPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New offer</h1>
      <NewOfferForm />
    </div>
  );
}
