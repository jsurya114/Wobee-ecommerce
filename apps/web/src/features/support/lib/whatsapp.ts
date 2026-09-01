/**
 * WhatsApp click-to-chat config (UI refinement pass). Deliberately does NOT
 * "fail fast" like `lib/api-client.ts`'s `apiBaseUrl()`/`lib/site-url.ts`'s
 * `siteUrl()` — those are load-bearing infrastructure every page needs;
 * this is a supplementary support channel that should degrade to "button
 * doesn't render" when unconfigured, not crash the storefront.
 */
export function whatsappNumber(): string | null {
  const value = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  return value && value.trim() ? value.trim() : null;
}

/** `null` when no number is configured — callers render nothing in that case. */
export function buildWhatsAppHref(message: string): string | null {
  const number = whatsappNumber();
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
