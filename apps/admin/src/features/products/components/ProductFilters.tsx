"use client";

import { Input } from "@woobe/ui";
import Link from "next/link";
import type { CategoryOption } from "../api/admin-categories.client";

export function ProductFilters({
  search,
  categoryId,
  categories,
  onSearchChange,
  onCategoryChange,
}: {
  search: string;
  categoryId: string | undefined;
  categories: CategoryOption[];
  onSearchChange: (search: string) => void;
  onCategoryChange: (categoryId: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        name="search"
        aria-label="Search products by name"
        placeholder="Search products"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <select
        name="categoryId"
        aria-label="Filter by category"
        value={categoryId ?? ""}
        onChange={(e) => onCategoryChange(e.target.value || undefined)}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <Link href="/products/new" className="ml-auto rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
        New product
      </Link>
    </div>
  );
}
