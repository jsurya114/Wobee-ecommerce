"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as categoriesApi from "../api/admin-categories.client";
import { categoriesAdminQueryKey } from "../hooks/useAdminCategoriesAdmin";
import { CategoryForm } from "./CategoryForm";

export function NewCategoryForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  return (
    <Card className="max-w-xl p-4">
      <CategoryForm
        submitLabel="Create category"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => categoriesApi.createCategory(payload, token));
          await queryClient.invalidateQueries({ queryKey: categoriesAdminQueryKey });
          toast.success("Category created");
          router.push(`/categories/${result.category.id}`);
        }}
      />
    </Card>
  );
}
