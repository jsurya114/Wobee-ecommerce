/** project_planning/woobe_ui_design_plan.md §5 — standard 4px-base Tailwind scale. */
export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
  16: "64px",
} as const;

/** Soft, not sharp — buttons/inputs vs. cards vs. pill badges/chips. */
export const radius = {
  control: "8px",
  card: "16px",
  pill: "9999px",
} as const;

/** Minimal elevation — one soft shadow for cards, a stronger one for modals. Avoid heavy drop shadows. */
export const shadow = {
  card: "0 2px 12px rgba(38,34,32,0.06)",
  modal: "0 8px 32px rgba(38,34,32,0.14)",
} as const;
