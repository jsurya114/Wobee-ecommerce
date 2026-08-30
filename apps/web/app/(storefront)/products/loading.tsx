import { Skeleton } from "@woobe/ui";

/**
 * Week 2 Day 9 (week2 (1).md §21 — "Skeleton loading states"). `/products`
 * is fully server-rendered per request (live catalogue data, ADR-026) with
 * no client-side fallback of its own — without this file, Next shows
 * nothing during that server round trip on every navigation into this
 * route. Mirrors ProductGrid's own `grid-cols-2 sm:grid-cols-3
 * lg:grid-cols-4` layout and ProductCard's `aspect-[3/4]` image shape so
 * nothing visibly jumps once the real grid replaces it.
 */
export default function ProductsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Skeleton className="mb-4 h-7 w-20" />
      <Skeleton className="mb-4 h-10 w-full rounded-control" />
      <div className="mb-3 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-pill" />
        ))}
      </div>
      <div className="mb-5 flex gap-2">
        <Skeleton className="h-9 w-24 rounded-control" />
        <Skeleton className="h-9 w-40 rounded-control" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[3/4] w-full rounded-card" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-1.5 h-3 w-1/3" />
          </div>
        ))}
      </div>
    </main>
  );
}
