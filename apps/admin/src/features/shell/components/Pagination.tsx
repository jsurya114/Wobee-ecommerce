import { Button } from "@woobe/ui";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  itemCount: number;
  onPageChange: (page: number) => void;
}

/** Shared Prev/Next control for admin list pages, driven by the `{items, total}` shape every admin list endpoint already returns. */
export function Pagination({ page, pageSize, total, itemCount, onPageChange }: PaginationProps) {
  if (total === 0) return null;

  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = (page - 1) * pageSize + itemCount;

  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="font-body text-sm text-text-secondary">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={!hasPrev}>
          Previous
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={!hasNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
