import { NewCategoryForm } from "@/features/categories/components/NewCategoryForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewCategoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/categories", label: "Categories" }} title="New category" />
      <NewCategoryForm />
    </div>
  );
}
