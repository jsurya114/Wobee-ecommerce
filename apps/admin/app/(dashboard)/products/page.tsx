"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { listCategories } from "@/features/products/api/admin-categories.client";
import type { CategoryOption } from "@/features/products/api/admin-categories.client";
import { ProductFilters } from "@/features/products/components/ProductFilters";
import { ProductsTable } from "@/features/products/components/ProductsTable";
import { useAdminProducts } from "@/features/products/hooks/useAdminProducts";

export default function ProductsPage() {
  const { accessToken } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const { items, loading, error } = useAdminProducts({ search: search || undefined, categoryId, page: 1, pageSize: 50 });

  useEffect(() => {
    if (!accessToken) return;
    void listCategories(accessToken).then((result) => setCategories(result.categories));
  }, [accessToken]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-text-primary">Products</h1>
        <p className="font-body text-sm text-text-secondary">Manage your catalogue and variants.</p>
      </div>
      <ProductFilters search={search} categoryId={categoryId} categories={categories} onSearchChange={setSearch} onCategoryChange={setCategoryId} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <ProductsTable items={items} />
      )}
    </div>
  );
}
