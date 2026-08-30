// Shared Tailwind preset — raw design-token values for both apps/web and apps/admin.
// Canonical source of truth for the *values* is packages/ui/src/tokens/*.ts;
// this file mirrors them for Tailwind's CJS config loader. Keep the two in sync
// by hand until a build step can generate one from the other (not needed at Week 1 scale).
// See project_planning/woobe_ui_design_plan.md §3-5.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      // Week 2 Day 9 (week2 (1).md §20) — primary/text.secondary/success
      // darkened for WCAG AA contrast; see packages/ui/src/tokens/colors.ts's
      // own comment (the canonical source of truth these values mirror) for
      // the full reasoning.
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
        // Redesign: the storefront's compact section rhythm — replaces the
        // hand-written `py-10` (80px) that made the homepage feel like a
        // slideshow.
        section: "1.75rem",
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
