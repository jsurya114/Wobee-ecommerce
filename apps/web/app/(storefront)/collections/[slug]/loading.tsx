import { Skeleton } from "@woobe/ui";

/** Week 2 Day 9 — mirrors the collection detail page's heading + ProductGrid layout. */
export default function CollectionDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[3/4] w-full rounded-card" />
            <Skeleton className="mt-3 h-4 w-4/5" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </main>
  );
}
