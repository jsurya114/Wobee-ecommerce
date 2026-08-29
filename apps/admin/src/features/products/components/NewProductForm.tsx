"use client";

import { Card } from "@woobe/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { listCategories } from "../api/admin-categories.client";
import type { CategoryOption } from "../api/admin-categories.client";
import * as productsApi from "../api/admin-products.client";
import { ProductForm } from "./ProductForm";

export function NewProductForm() {
  const router = useRouter();
  const { accessToken } = useAdminAuth();
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    void listCategories(accessToken).then((result) => setCategories(result.categories));
  }, [accessToken]);

  return (
    <Card className="max-w-2xl p-4">
      <ProductForm
        categories={categories}
        submitLabel="Create product"
        onSubmit={async (payload) => {
          if (!accessToken) return;
          const result = await productsApi.createProduct(payload, accessToken);
          toast.success("Product created");
          router.push(`/products/${result.product.id}`);
        }}
      />
    </Card>
  );
}
