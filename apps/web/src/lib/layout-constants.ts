/**
 * Shared height for the mobile-only sticky BottomNav (`BottomNav.tsx`).
 * Any other `fixed`, bottom-pinned element that needs to sit flush above
 * the nav (e.g. ProductPurchasePanel's mobile buy bar) must offset itself
 * by this same value — a hardcoded guess (e.g. Tailwind's `bottom-20`)
 * silently drifts from BottomNav's real rendered height and leaves a gap
 * of exposed page background between the two bars.
 */
export const MOBILE_BOTTOM_NAV_HEIGHT_REM = "4.25rem";

/** `bottom` offset for a fixed element that should sit directly on top of BottomNav, safe-area included. */
export const ABOVE_MOBILE_BOTTOM_NAV_STYLE = {
  bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom))`,
} as const;

/**
 * `scroll-margin-bottom` for a NORMAL-FLOW element near the end of a page
 * (a form's submit button, say) whose page is only a little taller than the
 * viewport — the storefront layout's `pb-20` correctly guarantees clearance
 * from BottomNav once the page is scrolled all the way down, but on FIRST
 * render (scrollY 0) an element that close to the bottom can still render
 * mostly behind the fixed, `z-30` nav (confirmed live, Week 2 Day 3:
 * `/account/addresses`'s "Add address" button rendered 4px visible / 40px
 * hidden under BottomNav before any scroll, and a tap on its visible sliver
 * landed on BottomNav's own link instead — the browser's native
 * `scrollIntoView`/focus-scroll behavior doesn't know a fixed sibling is
 * covering part of the viewport, so without this it stops "close enough"
 * rather than actually clear of the nav). Apply to any submit button (or
 * other interactive element) that isn't already guaranteed to render well
 * above the fold on a short-viewport phone.
 */
export const SCROLL_MARGIN_ABOVE_BOTTOM_NAV_STYLE = {
  scrollMarginBottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom))`,
} as const;
