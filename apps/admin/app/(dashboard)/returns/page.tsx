"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ReturnFilters } from "@/features/returns/components/ReturnFilters";
import { ReturnsTable } from "@/features/returns/components/ReturnsTable";
import { useAdminReturns } from "@/features/returns/hooks/useAdminReturns";
import type { ReturnStatus } from "@/features/returns/api/admin-returns.client";

const PAGE_SIZE = 50;

function ReturnsPageContent() {
  const [status, setStatus] = useState<ReturnStatus | undefined>(undefined);
  // Set from the admin order-detail page's "return requested" link (Week 2 Day 7) — narrows the queue to that one order's returns.
  const orderId = useSearchParams().get("orderId") ?? undefined;
  const [page, setPage] = useState(1);
  const { items, total, loading, error } = useAdminReturns({ status, orderId, page, pageSize: PAGE_SIZE });

  useEffect(() => {
    setPage(1);
  }, [status, orderId]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">Returns</h1>
      {orderId ? <p className="font-body text-sm text-text-secondary">Showing returns for this order only.</p> : null}
      <ReturnFilters status={status} onStatusChange={setStatus} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <>
          <ReturnsTable items={items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default function ReturnsPage() {
  // useSearchParams requires a Suspense boundary (Next.js 15) — falls back to the same loading copy used once data-fetching starts.
  return (
    <Suspense fallback={<LoadingState />}>
      <ReturnsPageContent />
    </Suspense>
  );
}
