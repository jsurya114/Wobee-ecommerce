import { Skeleton } from "@woobe/ui";

/** Week 2 Day 9 — mirrors ProductDetail's own `grid md:grid-cols-2` image/info layout. Overrides the `/products` segment's own loading.tsx for this more specific route. */
export default function ProductDetailLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 md:pb-8">
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Skeleton className="aspect-[3/4] w-full rounded-card" />
        <div className="flex flex-col gap-6">
          <div>
            <Skeleton className="mb-3 h-6 w-24 rounded-pill" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </div>
          <Skeleton className="h-10 w-40" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-14 rounded-control" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-control" />
        </div>
      </div>
    </main>
  );
}
