import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one page header every admin screen uses (2026-09-29 admin UX pass) —
 * previously each page hand-rolled its own `<h1>` row, and no edit/create
 * page had a way back to its list other than the sidebar.
 *
 * - `back`: a "‹ Products"-style link to the parent list (edit/create pages).
 * - `meta`: status badges shown next to the title.
 * - `actions`: buttons/links, right-aligned; wraps under the title on
 *   narrow screens instead of overflowing.
 */
export function PageHeader({
  title,
  description,
  back,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-control px-1 py-0.5 font-body text-sm text-text-secondary transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="break-words font-display text-xl text-text-primary sm:text-2xl">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-0.5 font-body text-sm text-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
