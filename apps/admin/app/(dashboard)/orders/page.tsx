"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import type { OrderStatus } from "@woobe/types";
import { useState } from "react";
import { OrderFilters } from "@/features/order-management/components/OrderFilters";
import { OrdersTable } from "@/features/order-management/components/OrdersTable";
import { useAdminOrders } from "@/features/order-management/hooks/useAdminOrders";

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { items, loading, error } = useAdminOrders({ status, search: search || undefined, page: 1, pageSize: 50 });

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
        <OrdersTable items={items} />
      )}
    </div>
  );
}
