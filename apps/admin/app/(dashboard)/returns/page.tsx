"use client";

import { useState } from "react";
import { ReturnFilters } from "@/features/returns/components/ReturnFilters";
import { ReturnsTable } from "@/features/returns/components/ReturnsTable";
import { useAdminReturns } from "@/features/returns/hooks/useAdminReturns";
import type { ReturnStatus } from "@/features/returns/api/admin-returns.client";

export default function ReturnsPage() {
  const [status, setStatus] = useState<ReturnStatus | undefined>(undefined);
  const { items, loading, error } = useAdminReturns({ status, page: 1, pageSize: 50 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">Returns</h1>
      <ReturnFilters status={status} onStatusChange={setStatus} />
      {loading ? (
        <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <ReturnsTable items={items} />
      )}
    </div>
  );
}
