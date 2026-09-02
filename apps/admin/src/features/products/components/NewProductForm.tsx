"use client";

import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { useAdminCategories } from "../hooks/useAdminCategories";
import * as productsApi from "../api/admin-products.client";
import { ProductForm } from "./ProductForm";

export function NewProductForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const { categories } = useAdminCategories();

  return (
    <Card className="max-w-2xl p-4">
      <ProductForm
        categories={categories}
        submitLabel="Create product"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => productsApi.createProduct(payload, token));
          toast.success("Product created");
          router.push(`/products/${result.product.id}`);
        }}
      />
    </Card>
  );
}
