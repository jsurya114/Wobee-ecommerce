"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import type { OrderStatus } from "@woobe/types";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { OrderFilters } from "@/features/order-management/components/OrderFilters";
import { OrdersTable } from "@/features/order-management/components/OrdersTable";
import { useAdminOrders } from "@/features/order-management/hooks/useAdminOrders";

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { items, total, loading, error } = useAdminOrders({
    status,
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-text-primary">Orders</h1>
        <p className="font-body text-sm text-text-secondary">Track and fulfil customer orders.</p>
      </div>
      <OrderFilters status={status} search={search} onStatusChange={setStatus} onSearchChange={setSearch} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <>
          <OrdersTable items={items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
