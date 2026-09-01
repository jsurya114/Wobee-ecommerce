// Mirror of packages/config/tailwind/preset.cjs's `theme.extend.fontFamily`
// / `fontSize` — that file is canonical for every Tailwind utility class.
// This file exists only for a non-Tailwind consumer needing raw JS values
// (none currently — kept in sync anyway per the no-blind-deletion rule).
// Verified in sync 2026-09-01: previously listed fonts never loaded by the
// app (Cormorant Garamond, Plus Jakarta Sans) and a fontSize scale with no
// relationship to the live one — replaced with the real values.
export const typography = {
  fontFamily: {
    display: ["var(--font-playfair)", "Georgia", "serif"],
    body: ["var(--font-inter)", "system-ui", "sans-serif"],
  },
  fontSize: {
    micro: "0.6875rem", // 11px — card metadata (weight·rate, counts)
    label: "0.8125rem", // 13px — uppercase section labels
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "2rem", // 32px
    "4xl": "2.75rem", // 44px
  },
} as const;
