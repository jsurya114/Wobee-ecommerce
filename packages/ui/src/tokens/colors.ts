// Mirror of packages/config/tailwind/preset.cjs's `theme.extend.colors` —
// that file is canonical for every Tailwind utility class (`bg-primary`,
// `text-text-secondary`, etc.) used across apps/web and apps/admin. This
// file exists only for the rare non-Tailwind consumer that needs a raw JS
// color string (currently: apps/web's Razorpay checkout modal `theme.color`).
// Keep values here byte-identical to the preset — verified in sync 2026-09-01
// after finding this file had drifted (stale brand/text/status shades, one
// of which was silently mis-theming the Razorpay checkout widget).
export const colors = {
  canvas: {
    base: "#FBF1EC",
    surface: "#FFFFFF",
    subtle: "#F4EDE8",
    accent: "#F3DEE2",
  },
  text: {
    primary: "#262220",
    secondary: "#786D68",
    // No dedicated "muted" tier exists in the live preset (nothing needed a
    // third level yet) — mirrors `secondary`, already WCAG AA-verified
    // against both `canvas.base` and `canvas.surface`, rather than inventing
    // an unverified lighter shade here.
    muted: "#786D68",
  },
  brand: {
    primary: "#A54659",
    hover: "#884350",
    surface: "#F3DEE2",
  },
  border: {
    hairline: "#EDE3DF",
    focus: "#262220",
  },
  status: {
    success: "#4F684C",
    // No "warning" color exists in the live preset yet (unused) — left at
    // its prior value; not verified against anything since there's nothing
    // to verify against. Add to preset.cjs first if a real consumer needs it.
    warning: "#D97706",
    error: "#AE423D",
  },
} as const;
