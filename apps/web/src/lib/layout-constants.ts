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

/**
 * UI refinement pass (2026-09-01) — the mobile fixed-position stack now has
 * three tiers that can be visible at once: BottomNav (always, mobile), at
 * most one full-width bar directly above it (`ProductPurchasePanel`'s PDP
 * buy bar, `CartPageContent`'s checkout bar, or `FloatingCartWeightIndicator`
 * — mutually exclusive by route, see `useCartWeightBarVisibility`'s route
 * list), and `WhatsAppButton`, a small corner FAB that must clear whichever
 * of those (if any) is currently showing. Heights below are measured
 * against the real rendered elements, not guessed — keep them in sync if
 * any bar's content changes enough to change its height.
 */
export const STICKY_ACTION_BAR_HEIGHT_REM = "4.3125rem"; // 69px — PDP buy bar and the cart page's checkout bar, both measured live, happen to match
export const CART_WEIGHT_INDICATOR_HEIGHT_REM = "2.875rem"; // 46px, measured live
/** Breathing room between a floating element and whatever it's stacked above. */
export const FLOATING_STACK_GAP_REM = "0.625rem";

/**
 * `SiteHeader`'s real rendered height (measured live, both mobile and
 * desktop rows) — the `top` offset for any `position: sticky` element that
 * needs to sit flush directly below the header rather than under it (the
 * PLP's compact Size/Filters/Sort control bar, mobile UI refinement pass
 * 2026-09-01). Same "measured, not guessed" rule as the constants above.
 */
export const SITE_HEADER_HEIGHT_REM = "4.0625rem"; // 65px, measured live
