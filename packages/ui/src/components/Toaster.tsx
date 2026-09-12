"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * The one `<Toaster />` for the whole product (both `apps/web` and
 * `apps/admin` render this, nothing else) — added after an audit (2026-09-12)
 * found every toast across the app was styled by sonner's own `richColors`
 * prop, which paints success/error/warning/info in sonner's generic
 * green/red/yellow/blue regardless of this codebase's actual design tokens
 * (`packages/config/tailwind/preset.cjs`) — the one visible place in the
 * whole product that never looked like Woobe.
 *
 * Fix is `richColors` removed, not reconfigured: sonner only swaps a toast's
 * background/border/text to its per-type rich color when `data-rich-colors`
 * is set (confirmed by reading the installed package's own bundled CSS) —
 * without it, every toast type already renders through the same `--normal-*`
 * CSS variables sonner exposes for exactly this kind of theming (see
 * https://sonner.emilkowal.ski/styling), so pointing those at this app's own
 * brand tokens gives every toast — success, error, warning, info, and the
 * bare `toast(...)` default alike — one identical Woobe-pink card. Colors
 * below are this codebase's own existing tokens (`primary`/`primary-tint`
 * from the Tailwind preset), not new hex values invented for this file.
 *
 * Type distinction is preserved, just not via a full background swap:
 * sonner already renders a different icon (check/✕/△/ⓘ) per type regardless
 * of `richColors`, and `success`/`error` (by far the two types actually used
 * — see `apps/web`/`apps/admin`'s own call sites) additionally tint just
 * that icon using the app's existing `success`/`error` status tokens, the
 * same muted, WCAG-verified colors `Badge`'s own success/error variants
 * already use — reused, not reinvented. `warning`/`info` fall back to the
 * same pink-tinted icon as the default toast: `info` already reads fine that
 * way (it's not an alarm), and `warning` has no dedicated token in the
 * Tailwind preset today (only an explicitly-unverified value in
 * `tokens/colors.ts`) and zero real call sites — inventing a color for it
 * here would violate "reuse existing tokens, don't invent a new palette."
 * Add one to the preset first if a real `toast.warning(...)` call ever needs
 * its own icon color.
 *
 * Message text, duration, dismiss/action buttons, swipe-to-dismiss, and
 * every ARIA/keyboard behavior are all still sonner's own — this file only
 * overrides color, never layout, animation, or structural markup.
 */
const TOAST_THEME_STYLE = {
  // Brand surface (`primary.tint` in the Tailwind preset / `brand.surface` in
  // packages/ui/src/tokens/colors.ts) — the same pale pink used for Badge's
  // neutral variant and Button's secondary/ghost hover fill.
  "--normal-bg": "#F3DEE2",
  "--normal-text": "#262220", // `text.primary` — verified AA against this background already (see tokens/colors.ts).
  // `primary` (#A54659) as a soft-tinted border/hover, not a new color —
  // same "existing brand color at reduced opacity" idiom this codebase
  // already uses for Badge's own success/error variants (`bg-success/15`).
  "--normal-border": "rgba(165, 70, 89, 0.25)",
  "--normal-bg-hover": "rgba(165, 70, 89, 0.12)",
  "--normal-border-hover": "rgba(165, 70, 89, 0.4)",
} as CSSProperties;

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      style={TOAST_THEME_STYLE}
      toastOptions={{
        classNames: {
          // `data-icon`'s child <svg> renders with `fill="currentColor"` —
          // tinting just this wrapper (not `classNames.toast`, which would
          // recolor the whole card and defeat the "one consistent theme"
          // point of this file) keeps the shared pink card identical across
          // every type while still giving success/error their own accent.
          success: "[&>[data-icon]]:text-success",
          error: "[&>[data-icon]]:text-error",
        },
      }}
    />
  );
}
