"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import { TestimonialsFilters } from "@/features/testimonials/components/TestimonialsFilters";
import { TestimonialsList } from "@/features/testimonials/components/TestimonialsList";
import { useAdminTestimonials } from "@/features/testimonials/hooks/useAdminTestimonials";
import type { TestimonialStatus } from "@/features/testimonials/api/admin-testimonials.client";
import { PageHeader } from "@/features/shell/components/PageHeader";

const PAGE_SIZE = 50;

/** Testimonial moderation queue (2026-09-11) — MANAGE_TESTIMONIALS-gated (super_admin only), same list-page shape as ReturnsPage. */
export default function TestimonialsPage() {
  const [status, setStatus] = useState<TestimonialStatus | undefined>("PENDING");
  const [page, setPage] = useState(1);
  const { items, total, loading, error, approve, reject } = useAdminTestimonials({ status, page, pageSize: PAGE_SIZE });

  useEffect(() => {
    setPage(1);
  }, [status]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Testimonials" description="Approve customer reviews before they appear on the storefront." />
      <TestimonialsFilters status={status} onStatusChange={setStatus} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <>
          <TestimonialsList items={items} onApprove={approve} onReject={reject} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
