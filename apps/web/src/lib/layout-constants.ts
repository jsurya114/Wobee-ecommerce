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
