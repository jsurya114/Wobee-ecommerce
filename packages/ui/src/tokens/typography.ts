/**
 * project_planning/woobe_ui_design_plan.md §4.
 * Display: Playfair Display (editorial serif, matches the wordmark).
 * Body/UI: Inter (readable at small sizes, pairs cleanly against the serif).
 * Both loaded via next/font in apps/web's root layout (Google Fonts, free,
 * variable weight) — see apps/web/src/app/layout.tsx.
 */
export const typography = {
  fontFamily: {
    display: "var(--font-playfair), Georgia, serif",
    body: "var(--font-inter), system-ui, sans-serif",
  },
  // rem-based, mobile-first. Display sizes (3xl/4xl) reserved for Playfair.
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
    "4xl": "2.75rem",
  },
} as const;
