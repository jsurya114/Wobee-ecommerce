/**
 * The storefront's one liquid-glass surface — the exact classes `BottomNav`
 * introduced (mobile UI refinement, 2026-09-21), now shared so the mobile
 * search bar wears the identical treatment instead of a lookalike. Change a
 * value here and both move together.
 *
 * Visual layers only (no size, position or layout — each consumer owns
 * those):
 *  - translucent white fill + `backdrop-blur` + `saturate`, so page content
 *    genuinely shows through blurred (glass, not a white card);
 *  - a 1px white hairline border, an inset top highlight and one soft,
 *    low-opacity drop shadow to lift it off the page;
 *  - a faint top-down sheen (`::before`) for depth — the consumer must be
 *    `relative`/`fixed` (the sheen is `absolute`) and keep its own content
 *    positioned above it;
 *  - `@supports not (backdrop-filter)` falls back to a near-opaque white so
 *    text stays legible without blur.
 */
export const LIQUID_GLASS_RADIUS_CLASS = "rounded-[1.375rem]";

export const LIQUID_GLASS_SURFACE_CLASS = [
  "border border-white/70 bg-white/70 backdrop-blur-2xl backdrop-saturate-[1.6]",
  "shadow-[0_10px_32px_-6px_rgba(38,34,32,0.18),0_2px_6px_rgba(38,34,32,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]",
  // Faint top-down sheen — the "liquid" highlight, clipped to the panel's own radius.
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/55 before:via-white/0 before:to-white/0",
  // No backdrop-filter support: stay legible with a near-opaque surface.
  "[@supports_not_(backdrop-filter:blur(1px))]:bg-white/95",
].join(" ");
