"use client";

import type { OrderStatus } from "@woobe/types";
import { Input } from "@woobe/ui";

const STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export function OrderFilters({
  status,
  search,
  onStatusChange,
  onSearchChange,
}: {
  status: OrderStatus | undefined;
  search: string;
  onStatusChange: (status: OrderStatus | undefined) => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <select
        value={status ?? ""}
        onChange={(e) => onStatusChange((e.target.value || undefined) as OrderStatus | undefined)}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <Input
        placeholder="Search order number or email"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
    </div>
  );
}
