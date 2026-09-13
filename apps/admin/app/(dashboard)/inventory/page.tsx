"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { InventoryFilters } from "@/features/inventory/components/InventoryFilters";
import { InventoryTable } from "@/features/inventory/components/InventoryTable";
import { useAdminInventory } from "@/features/inventory/hooks/useAdminInventory";

const PAGE_SIZE = 100;

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { items, total, loading, error, adjust } = useAdminInventory({
    search: debouncedSearch || undefined,
    lowStockOnly: lowStockOnly || undefined,
    outOfStockOnly: outOfStockOnly || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, lowStockOnly, outOfStockOnly]);

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
        <>
          <InventoryTable items={items} onAdjust={adjust} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
