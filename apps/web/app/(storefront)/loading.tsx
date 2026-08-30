import { Skeleton } from "@woobe/ui";

/**
 * Week 2 Day 9 — the homepage (`force-dynamic`, ADR-026) awaits
 * `Promise.all([listCategories(), getHomePage()])` before rendering
 * anything; without this, a client-side navigation back to `/` (e.g. the
 * header logo or the new "Home" nav link) shows nothing until that
 * resolves. A light skeleton of the top of the page (category row + first
 * product rail) — not a full replica of every section, since the wait is brief.
 */
export default function HomeLoading() {
  return (
    <main>
      <div className="px-4 py-10 sm:px-6">
        <Skeleton className="mx-auto mb-6 h-7 w-40" />
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
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
