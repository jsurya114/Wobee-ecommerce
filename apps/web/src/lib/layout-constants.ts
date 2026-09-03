/**
 * BottomNav (`BottomNav.tsx`, liquid-glass redesign 2026-09-03) floats as a
 * rounded dock inset from the viewport edge, rather than sitting flush at
 * `bottom: 0` — its own two pieces, exported so BottomNav is the only place
 * that hardcodes either number.
 */
export const BOTTOM_NAV_DOCK_HEIGHT_REM = "3.5rem"; // capsule content height, measured live (2026-09-03 refinement pass 2 — trimmed from 3.75rem for a smaller footprint)
export const BOTTOM_NAV_FLOAT_GAP_REM = "0.75rem"; // gap between the capsule and the safe-area edge

/**
 * Total footprint the floating dock claims at the bottom of the viewport
 * (capsule height + its own floating gap, safe-area handled separately by
 * each consumer below). Any other `fixed`, bottom-pinned element that needs
 * to sit flush above the nav (e.g. ProductPurchasePanel's mobile buy bar)
 * must offset itself by this same value — a hardcoded guess (e.g. Tailwind's
 * `bottom-20`) silently drifts from BottomNav's real rendered footprint and
 * leaves a gap of exposed page background between the two bars.
 */
export const MOBILE_BOTTOM_NAV_HEIGHT_REM = `calc(${BOTTOM_NAV_DOCK_HEIGHT_REM} + ${BOTTOM_NAV_FLOAT_GAP_REM})`;

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
export const STICKY_ACTION_BAR_HEIGHT_REM = "4.3125rem"; // 69px — PDP buy bar, both measured live
export const CART_WEIGHT_INDICATOR_HEIGHT_REM = "2.875rem"; // 46px, measured live
/** Breathing room between a floating element and whatever it's stacked above. */
export const FLOATING_STACK_GAP_REM = "0.625rem";

/**
 * The cart page's unified checkout dock (`CheckoutDock.tsx`, 2026-09-04) —
 * a single glass surface combining the weight/free-shipping progress row
 * (when the cart has weight-based items) with the total + checkout action
 * row, replacing the old checkout-only bar (which used to share
 * `STICKY_ACTION_BAR_HEIGHT_REM` with the PDP buy bar "by coincidence").
 * Two heights because that top row is conditional on the cart actually
 * having weight-based items — `useWhatsAppBottomOffset` picks the right one
 * via the same `weightBasedTotalGrams > 0` check `CheckoutDock` itself uses.
 * The action-row-only case reuses `STICKY_ACTION_BAR_HEIGHT_REM` (same row
 * markup, so same real height) rather than a redundant constant.
 */
export const CART_CHECKOUT_DOCK_HEIGHT_REM = "7.3125rem"; // 117px, both rows, measured live

/**
 * `SiteHeader`'s real rendered height (measured live, both mobile and
 * desktop rows) — the `top` offset for any `position: sticky` element that
 * needs to sit flush directly below the header rather than under it (the
 * PLP's compact Size/Filters/Sort control bar, mobile UI refinement pass
 * 2026-09-01). Same "measured, not guessed" rule as the constants above.
 */
export const SITE_HEADER_HEIGHT_REM = "3.1875rem"; // 51px, measured live (centered-logo mobile header, liquid-glass redesign 2026-09-03)
