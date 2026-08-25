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
 * Accessibility: `primary` on `background` likely fails WCAG AA for small
 * body text — reserve it for large text/buttons/icons; use `text.primary`
 * for anything read at body size. Verify with a contrast checker before
 * shipping real content, don't eyeball it (see design plan §3).
 */
export const colors = {
  primary: {
    DEFAULT: "#C77B8A",
    hover: "#B36473",
    tint: "#F3DEE2",
  },
  background: "#FBF1EC",
  surface: "#FFFFFF",
  text: {
    primary: "#262220",
    secondary: "#8C7F7A",
  },
  border: "#EDE3DF",
  success: "#7A9B76",
  error: "#B5453F",
} as const;
