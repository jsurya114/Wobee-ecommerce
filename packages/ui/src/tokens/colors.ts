/**
 * Woobe brand color tokens — project_planning/woobe_ui_design_plan.md §3.
 * NOTE (from that doc): derived from the reference mockups' visual direction,
 * not pixel-sampled from a brand file. Swap for exact hex values once a
 * designer finalizes them — search the repo for this file when that happens.
 *
 * Mirrored (by hand, for now) in packages/config/tailwind/preset.cjs so both
 * Tailwind utility classes and direct TS/JS consumers (e.g. dynamic inline
 * styles, chart colors) read the same values. Keep both in sync on change.
 *
 * Accessibility (Week 2 Day 9, week2 (1).md §20): this file's own prior
 * comment warned "verify with a contrast checker before shipping real
 * content, don't eyeball it" — a real Lighthouse audit finally did that and
 * found the warning had gone unheeded in practice: `primary` was in active
 * use as small body/label text (nav labels, the header logo) and as a
 * button background under white text, both well under WCAG AA's 4.5:1 for
 * normal-size text; `text.secondary` and `success` (the latter as badge
 * text over its own tinted background, e.g. Badge's `success` variant) were
 * short too. All three darkened here — same hue/saturation, lower
 * lightness — until every real rendered pairing found across BOTH apps
 * (text-on-`background`, text-on-`surface`/white, text-on-`primary.tint`
 * — apps/admin's active sidebar link uses exactly this pairing, caught in
 * a second audit pass after the first fix — white-on-`primary`-as-a-
 * button-fill, `success`-on-its-own-15%-tint) clears 4.5:1, computed with
 * the actual WCAG relative-luminance formula, not eyeballed.
 */
export const colors = {
  primary: {
    DEFAULT: "#A54659",
    hover: "#884350",
    tint: "#F3DEE2",
  },
  background: "#FBF1EC",
  surface: "#FFFFFF",
  /** Redesign: warm neutral fill for product-image placeholders / sheet handles / subtle zones. Mirrored in the Tailwind preset as `surface-2`. */
  surface2: "#F4EDE8",
  /** Redesign: scrim behind bottom sheets / dialogs. Mirrored as `overlay`. */
  overlay: "rgba(38,34,32,0.45)",
  text: {
    primary: "#262220",
    secondary: "#786D68",
  },
  border: "#EDE3DF",
  // Darkened once more than the first pass below — apps/admin's own
  // "active" product-status badge (same Badge `success` variant) sits over
  // `background` (#FBF1EC), not `surface`/white, and that composite is a
  // harder pairing (a second Lighthouse pass on apps/admin caught it after
  // the first fix only checked the white case).
  success: "#4F684C",
  // Same reasoning/fix as `success` above — Badge's `error` variant
  // (`bg-error/10 text-error`) over `background` also fell short (4.25),
  // caught by the same admin-table audit pass.
  error: "#AE423D",
} as const;
