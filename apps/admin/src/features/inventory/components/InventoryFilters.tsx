"use client";

import { Input } from "@woobe/ui";

export function InventoryFilters({
  search,
  lowStockOnly,
  outOfStockOnly,
  onSearchChange,
  onLowStockChange,
  onOutOfStockChange,
}: {
  search: string;
  lowStockOnly: boolean;
  outOfStockOnly: boolean;
  onSearchChange: (search: string) => void;
  onLowStockChange: (value: boolean) => void;
  onOutOfStockChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Input
        name="search"
        aria-label="Search by SKU or product name"
        placeholder="Search SKU or product"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <label className="flex items-center gap-2 font-body text-sm text-text-primary">
        <input type="checkbox" checked={lowStockOnly} onChange={(e) => onLowStockChange(e.target.checked)} />
        Low stock only
      </label>
      <label className="flex items-center gap-2 font-body text-sm text-text-primary">
        <input type="checkbox" checked={outOfStockOnly} onChange={(e) => onOutOfStockChange(e.target.checked)} />
        Out of stock only
      </label>
    </div>
  );
}
