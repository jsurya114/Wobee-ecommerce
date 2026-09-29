import type { CSSProperties, ReactNode } from "react";
import { COMPACT_SEARCH_BAR_HEIGHT_REM, SITE_HEADER_HEIGHT_REM } from "@/lib/layout-constants";

/**
 * Sticky Size/Filters/Sort row (mobile UI refinement pass 2026-09-01) —
 * mobile-only: sticks directly below `SiteHeader` while the category/
 * collection chips above it scroll away normally, so on scroll only the
 * header + this bar stay visually persistent. Reverts to plain static flow
 * at `sm:` and up — desktop already has room for these controls inline and
 * never asked for a sticky treatment.
 *
 * Below `md` the shop page also carries the sticky `CompactSearchBar`
 * (2026-09-21), which occupies the slot directly under the header — so on
 * those widths this row sticks under header + search bar instead. The
 * offset is a CSS variable pair rather than one inline `top` because an
 * inline style can't change at a breakpoint.
 *
 * Glass (2026-09-21): the bar has no fill of its own — its triggers wear the
 * shared liquid-glass surface (`PLP_CONTROL_INACTIVE_CLASS`), like the search
 * pill above. `overflow-x-auto` clips vertically too, so the extra bottom/top
 * padding is room for the triggers' drop shadow; the negative margins cancel
 * it out so the row's footprint in the page flow is unchanged.
 *
 * Swipe fix (2026-09-29): the bar used to be `pointer-events-none` so its
 * transparent padding couldn't swallow taps meant for content beneath, but a
 * scroll container that ignores pointer events can't be swiped (iOS Safari,
 * and the gaps between triggers everywhere) — which only showed once the
 * row outgrew a phone screen. The bar now takes touches, and the bottom
 * padding is trimmed (pb-8 → pb-4, margin adjusted to keep the same
 * footprint) so the tap-blocking strip under it stays small.
 */
export function PlpControlBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky top-[var(--plp-top-with-search)] z-10 -mx-4 -mt-1 mb-3 flex items-center gap-2 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:static sm:z-auto sm:mx-0 sm:mt-0 sm:mb-5 sm:flex-wrap sm:overflow-visible sm:p-0 [&::-webkit-scrollbar]:hidden"
      style={
        {
          "--plp-top-with-search": `calc(${SITE_HEADER_HEIGHT_REM} + ${COMPACT_SEARCH_BAR_HEIGHT_REM})`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
