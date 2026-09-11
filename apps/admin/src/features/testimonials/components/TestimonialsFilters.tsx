"use client";

import type { TestimonialStatus } from "../api/admin-testimonials.client";

const STATUSES: TestimonialStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export function TestimonialsFilters({
  status,
  onStatusChange,
}: {
  status: TestimonialStatus | undefined;
  onStatusChange: (status: TestimonialStatus | undefined) => void;
}) {
  return (
    <select
      name="status"
      aria-label="Filter by testimonial status"
      value={status ?? ""}
      onChange={(e) => onStatusChange((e.target.value || undefined) as TestimonialStatus | undefined)}
      className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
    >
      <option value="">All statuses</option>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}
