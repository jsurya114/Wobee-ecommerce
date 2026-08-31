export const typography = {
  fontFamily: {
    serif: ["Playfair Display", "Cormorant Garamond", "Georgia", "serif"],
    sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
  },
  fontSize: {
    xs: ["0.6875rem", { lineHeight: "0.875rem" }],   // 11px
    sm: ["0.75rem", { lineHeight: "1rem" }],          // 12px
    base: ["0.8125rem", { lineHeight: "1.125rem" }],  // 13px
    md: ["0.875rem", { lineHeight: "1.25rem" }],      // 14px
    lg: ["0.9375rem", { lineHeight: "1.375rem" }],    // 15px
    xl: ["1rem", { lineHeight: "1.5rem" }],          // 16px
    "2xl": ["1.125rem", { lineHeight: "1.5rem" }],    // 18px
    "3xl": ["1.25rem", { lineHeight: "1.75rem" }],    // 20px
    "4xl": ["1.5rem", { lineHeight: "2rem" }],        // 24px
  },
} as const;
