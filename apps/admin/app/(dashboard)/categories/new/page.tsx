import { NewCategoryForm } from "@/features/categories/components/NewCategoryForm";

export default function NewCategoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New category</h1>
      <NewCategoryForm />
    </div>
  );
}
