import { NewCollectionForm } from "@/features/collections/components/NewCollectionForm";

export default function NewCollectionPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New collection</h1>
      <NewCollectionForm />
    </div>
  );
}
