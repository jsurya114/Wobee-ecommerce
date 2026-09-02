"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { useState } from "react";
import { InventoryFilters } from "@/features/inventory/components/InventoryFilters";
import { InventoryTable } from "@/features/inventory/components/InventoryTable";
import { useAdminInventory } from "@/features/inventory/hooks/useAdminInventory";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const { items, loading, error, adjust } = useAdminInventory({
    search: search || undefined,
    lowStockOnly: lowStockOnly || undefined,
    outOfStockOnly: outOfStockOnly || undefined,
    page: 1,
    pageSize: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-text-primary">Inventory</h1>
        <p className="font-body text-sm text-text-secondary">Monitor stock levels and adjust quantities.</p>
      </div>
      <InventoryFilters
        search={search}
        lowStockOnly={lowStockOnly}
        outOfStockOnly={outOfStockOnly}
        onSearchChange={setSearch}
        onLowStockChange={setLowStockOnly}
        onOutOfStockChange={setOutOfStockOnly}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <InventoryTable items={items} onAdjust={adjust} />
      )}
    </div>
  );
}
