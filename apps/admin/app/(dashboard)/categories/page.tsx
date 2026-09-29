"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { CategoriesTable } from "@/features/categories/components/CategoriesTable";
import { useAdminCategoriesAdmin } from "@/features/categories/hooks/useAdminCategoriesAdmin";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function CategoriesPage() {
  const { items, loading, error } = useAdminCategoriesAdmin();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Categories"
        description="Organize the catalogue and control what shows on the storefront."
        actions={
          <Link href="/categories/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
            New category
          </Link>
        }
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <CategoriesTable items={items} />
      )}
    </div>
  );
}
