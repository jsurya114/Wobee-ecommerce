import type { ReactNode } from "react";
import { SITE_HEADER_HEIGHT_REM } from "@/lib/layout-constants";

/**
 * Sticky Size/Filters/Sort row (mobile UI refinement pass 2026-09-01) —
 * mobile-only: sticks directly below `SiteHeader` while the category/
 * collection chips above it scroll away normally, so on scroll only the
 * header + this bar stay visually persistent. Reverts to plain static flow
 * at `sm:` and up — desktop already has room for these controls inline and
 * never asked for a sticky treatment.
 */
export function PlpControlBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky z-10 -mx-4 mb-5 flex items-center gap-2 overflow-x-auto border-b border-border bg-surface px-4 py-2 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] sm:static sm:z-auto sm:mx-0 sm:mb-5 sm:flex-wrap sm:overflow-visible sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none [&::-webkit-scrollbar]:hidden"
      style={{ top: SITE_HEADER_HEIGHT_REM }}
    >
      {children}
    </div>
  );
}
