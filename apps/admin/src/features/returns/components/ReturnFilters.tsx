"use client";

import type { ReturnStatus } from "../api/admin-returns.client";

const STATUSES: ReturnStatus[] = ["RETURN_REQUESTED", "RETURN_APPROVED", "RETURN_REJECTED", "REFUND_INITIATED", "REFUNDED"];

export function ReturnFilters({ status, onStatusChange }: { status: ReturnStatus | undefined; onStatusChange: (status: ReturnStatus | undefined) => void }) {
  return (
    <select
      name="status"
      aria-label="Filter by return status"
      value={status ?? ""}
      onChange={(e) => onStatusChange((e.target.value || undefined) as ReturnStatus | undefined)}
      className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
    >
      <option value="">All statuses</option>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
