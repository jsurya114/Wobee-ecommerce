/**
 * First-party storefront analytics (2026-09-21) — feeds the admin conversion
 * funnel. Deliberately tiny and privacy-conscious:
 *  - an anonymous random UUID per browser SESSION (sessionStorage — gone when
 *    the tab session ends), no cookie, no fingerprinting, no personal data;
 *  - honours the browser's Do-Not-Track signal (no id is minted, nothing sent);
 *  - a CLOSED event vocabulary the API validates (see AnalyticsEventType);
 *  - fire-and-forget: it never throws, never blocks, and a failure is silent —
 *    analytics must not be able to break shopping.
 * Bots/blocked storage simply produce no funnel data.
 */

export type StorefrontEventType = "SESSION_STARTED" | "PRODUCT_VIEWED" | "CART_ADDED" | "CHECKOUT_STARTED";

const SESSION_KEY = "woobe_sid";
/** Header the checkout request carries so the order can be linked to its session (see apps/api orders.controller). */
export const ANALYTICS_SESSION_HEADER = "X-Woobe-Session";

let memorySessionId: string | null = null;

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.msDoNotTrack === "1";
}

/** The session's anonymous id, or null when tracking is off (server render, Do-Not-Track). */
export function getAnalyticsSessionId(): string | null {
  if (typeof window === "undefined" || doNotTrack()) return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Storage blocked: fall back to an in-memory id for this page lifetime.
    memorySessionId ??= crypto.randomUUID();
    return memorySessionId;
  }
}

export function trackEvent(event: { type: StorefrontEventType; productId?: string }): void {
  try {
    const sessionId = getAnalyticsSessionId();
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!sessionId || !base) return;
    void fetch(`${base}/api/v1/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, sessionId }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    // Never let analytics surface an error.
  }
}
