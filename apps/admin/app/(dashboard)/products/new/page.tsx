import { NewProductForm } from "@/features/products/components/NewProductForm";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New product</h1>
      <NewProductForm />
    </div>
  );
}
