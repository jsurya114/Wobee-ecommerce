import { NewOfferForm } from "@/features/offers/components/NewOfferForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewOfferPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/offers", label: "Offers" }} title="New offer" />
      <NewOfferForm />
    </div>
  );
}
