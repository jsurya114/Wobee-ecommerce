"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ComponentProps } from "react";
import { useWhatsAppBottomOffset } from "../hooks/useWhatsAppBottomOffset";
import { buildWhatsAppHref } from "../lib/whatsapp";

// Week 4 Day 8 fix (2026-09-04): the auth pages (all three share `AuthShell`)
// have a normal-flow primary submit button, not a fixed dock the way
// PDP/cart do — `useWhatsAppBottomOffset` has no way to reserve space above
// a button whose position depends on that specific form's field count and
// isn't knowable ahead of time the way a dock's fixed height is. Confirmed
// live at 375px: `/register`'s 4-field form puts "Create account" exactly
// inside this button's reserved band on first paint (no scroll needed) —
// `/login` and each `/forgot-password` step happen to have short enough
// forms to clear it, but that's incidental to their current field count, not
// a guarantee. Rather than hardcode a reservation tied to today's specific
// form heights (fragile — breaks silently again the next time a field is
// added), hide the widget on auth pages entirely: a pre-sales chat prompt
// isn't relevant mid-authentication anyway (common practice on checkout/auth
// screens elsewhere), and it removes this whole collision class instead of
// papering over one instance of it.
const HIDDEN_ON_PATHS = ["/login", "/register", "/forgot-password"];

const ENQUIRY_MESSAGE = "Hi Woobe, I have an enquiry.";

/** lucide-react carries no brand glyphs (see SiteFooter's Instagram/Facebook icons for the same reasoning) — inline SVG. */
function WhatsAppIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.1h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.14.82.84-3.06-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.26-8.24 2.2 0 4.28.86 5.84 2.42a8.2 8.2 0 0 1 2.42 5.83c0 4.55-3.7 8.27-8.26 8.27Zm4.52-6.19c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.24-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.45-1.37-1.7-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43.12-.14.16-.24.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42-.14-.01-.31-.01-.47-.01a.9.9 0 0 0-.66.31c-.23.24-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.16 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

/**
 * Floating WhatsApp enquiry button (UI refinement pass) — a compact, fixed
 * corner FAB rendered once at the storefront layout level (same tier as
 * `BottomNav`/`FloatingCartWeightIndicator`). Renders nothing when
 * `NEXT_PUBLIC_WHATSAPP_NUMBER` isn't configured — no hardcoded fallback
 * number lives in this component.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  const bottomOffset = useWhatsAppBottomOffset();
  const href = buildWhatsAppHref(ENQUIRY_MESSAGE);
  if (!href || HIDDEN_ON_PATHS.includes(pathname)) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Chat with Woobe on WhatsApp"
      // `bottom-[var(--wa-offset)]` (not an inline `bottom` style) so `md:bottom-6`
      // can still win in the cascade at the desktop breakpoint — an inline style
      // would out-specificity every responsive class regardless of viewport,
      // which is exactly what happened here before this fix (confirmed live:
      // the mobile calc leaked through at 1024px, landing the button ~147px
      // above the corner instead of the intended 24px).
      // Themed to Woobe's own brand color (client-review request, 2026-09-03)
      // — the WhatsApp glyph itself is what signals "this opens WhatsApp";
      // the fill no longer needs to be WhatsApp's own #25D366 green, which
      // read as a bolted-on third-party widget against this site's warm
      // rose/clay palette everywhere else.
      className="fixed right-3 bottom-[var(--wa-offset)] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-card transition-transform hover:scale-105 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:bottom-6 md:right-6"
      style={{ "--wa-offset": bottomOffset } as CSSProperties}
    >
      <WhatsAppIcon className="h-5 w-5" />
    </a>
  );
}
