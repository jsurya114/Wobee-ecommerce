import { NewCollectionForm } from "@/features/collections/components/NewCollectionForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewCollectionPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/collections", label: "Collections" }} title="New collection" />
      <NewCollectionForm />
    </div>
  );
}
