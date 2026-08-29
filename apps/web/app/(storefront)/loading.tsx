import { Skeleton } from "@woobe/ui";

/**
 * Week 2 Day 9 — the homepage (`force-dynamic`, ADR-026) awaits
 * `Promise.all([listCategories(), getHomePage()])` before rendering
 * anything, including Hero's own static copy; without this, a client-side
 * navigation back to `/` (e.g. the header logo) shows nothing until that
 * resolves. A light skeleton, not a full replica of every section — Hero's
 * copy is static/never actually loading-dependent, so a heavy multi-section
 * skeleton would be more visual noise than the brief real wait it covers.
 */
export default function HomeLoading() {
  return (
    <main>
      <div className="px-4 py-16 text-center sm:px-6">
        <Skeleton className="mx-auto h-4 w-32" />
        <Skeleton className="mx-auto mt-4 h-10 w-3/4 max-w-lg" />
        <Skeleton className="mx-auto mt-3 h-10 w-2/3 max-w-md" />
        <Skeleton className="mx-auto mt-8 h-12 w-40 rounded-pill" />
      </div>
      <div className="px-4 py-10 sm:px-6">
        <Skeleton className="mx-auto mb-5 h-7 w-40" />
        <div className="mx-auto flex max-w-6xl gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-1/4 shrink-0 rounded-card" />
          ))}
        </div>
      </div>
    </main>
  );
}
