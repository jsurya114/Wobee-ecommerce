import { Skeleton } from "@woobe/ui";

/**
 * Homepage skeleton (`force-dynamic`, ADR-026) — shaped to the redesigned
 * layout so a client-side navigation back to `/` swaps in without a layout
 * shift: category rail, one product rail, the first grid rows.
 */
export default function HomeLoading() {
  return (
    <main>
      <div className="px-4 pt-3 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-10 w-full rounded-control" />
        </div>
      </div>
      <section className="px-4 pt-4 pb-section sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="flex gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-section sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="mb-3 h-3 w-28" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-[43%] shrink-0 sm:w-[30%] lg:w-[22%]">
                <Skeleton className="aspect-[3/4] rounded-card" />
                <Skeleton className="mt-2 h-3 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-section sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <Skeleton className="aspect-[3/4] rounded-card" />
                <Skeleton className="mt-2 h-3 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
