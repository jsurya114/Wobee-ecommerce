"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { listCategories } from "@/features/products/api/admin-categories.client";
import type { CategoryOption } from "@/features/products/api/admin-categories.client";
import { ProductFilters } from "@/features/products/components/ProductFilters";
import { ProductsTable } from "@/features/products/components/ProductsTable";
import { useAdminProducts } from "@/features/products/hooks/useAdminProducts";

const PAGE_SIZE = 50;

export default function ProductsPage() {
  const { accessToken } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { items, total, loading, error } = useAdminProducts({
    search: debouncedSearch || undefined,
    categoryId,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    if (!accessToken) return;
    void listCategories(accessToken).then((result) => setCategories(result.categories));
  }, [accessToken]);

  // A filter/search change can leave `page` pointing past the new, smaller result set — reset to page 1 whenever the query itself changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId]);

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
        <>
          <ProductsTable items={items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
