import { NewProductForm } from "@/features/products/components/NewProductForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/products", label: "Products" }} title="New product" />
      <NewProductForm />
    </div>
  );
}
