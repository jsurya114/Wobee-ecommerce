// Shared Tailwind preset — canonical source of truth for every design-token
// VALUE used by apps/web and apps/admin (every `bg-primary`/`text-text-
// secondary`/etc. utility class resolves from here). packages/ui/src/tokens/
// *.ts mirrors these values by hand for the rare non-Tailwind consumer that
// needs a raw JS string (e.g. Razorpay checkout's `theme.color`) — keep that
// mirror in sync whenever a value changes here (2026-09-01: found and fixed
// a real drift, corrected direction of this comment to match).
// See project_planning/woobe_ui_design_plan.md §3-5.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      // Week 2 Day 9 (week2 (1).md §20) — primary/text.secondary/success
      // darkened for WCAG AA contrast (verified against both `background`
      // and `surface`).
      colors: {
        primary: {
          DEFAULT: "#A54659",
          hover: "#884350",
          tint: "#F3DEE2",
        },
        background: "#FBF1EC",
        surface: "#FFFFFF",
        // Redesign: a warm neutral fill for product-image placeholders,
        // sheet handles and subtle zones — replaces ad-hoc `primary-tint/40`.
        "surface-2": "#F4EDE8",
        // Redesign: scrim behind bottom sheets / dialogs.
        overlay: "rgba(38,34,32,0.45)",
        text: {
          primary: "#262220",
          secondary: "#786D68",
        },
        border: "#EDE3DF",
        success: "#4F684C",
        error: "#AE423D",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Redesign: two compact tiers below `xs` for dense commerce UI —
        // `micro` for card metadata (weight·rate, counts), `label` for the
        // uppercase section labels that replace the big serif headings.
        micro: "0.6875rem",
        label: "0.8125rem",
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "4xl": "2.75rem",
      },
      spacing: {
        4.5: "1.125rem",
        // Redesign (tightened 2026-08-31, 2026-09-03 final refinement pass):
        // the storefront's compact section rhythm — replaces the
        // hand-written `py-10` (80px) that made the homepage feel like a
        // slideshow. Only ever consumed by the homepage's own section
        // components (ProductRail, HomeGridSection, ShopByBudget,
        // FeaturedCollections, CustomerReviewsSection, loading.tsx) — every
        // adjacent pair each contributes this value once (their own bottom +
        // the next section's own top), so this is really *two* section-rhythm
        // gaps stacked at every boundary; tightened again from 1.125rem
        // after an audit found that compounding read as dead whitespace
        // between sections.
        section: "0.875rem",
      },
      borderRadius: {
        control: "8px",
        card: "16px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(38,34,32,0.06)",
        modal: "0 8px 32px rgba(38,34,32,0.14)",
        // Redesign: upward elevation for bottom sheets.
        sheet: "0 -8px 32px rgba(38,34,32,0.14)",
      },
    },
  },
};
