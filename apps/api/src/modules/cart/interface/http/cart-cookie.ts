import type { Response } from "express";
import { env } from "../../../../config/env";

export const CART_ID_COOKIE = "cart_id";

// 30 days — long enough that "add to cart, come back tomorrow" survives, short
// enough that an abandoned guest cart doesn't linger forever (ADR-011).
const CART_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Path this cookie was scoped to before Week 1 Day 4 widened it to
 * `/api/v1` (see git history). A browser that visited before that change
 * still carries a cart_id cookie pinned to this narrower path — cookies key
 * on (name, domain, path), so it does NOT get overwritten by a Set-Cookie
 * at the newer path; it just sits alongside it. Per RFC 6265 ordering the
 * browser sends the more specific path first, so this stale value shows up
 * as the FIRST `cart_id` in the Cookie header, with the real/current one
 * second. Express's cookie-parser keeps the LAST duplicate key, so reads
 * stay correct — until the current cookie gets cleared (e.g. after
 * checkout): then this stale leftover becomes the ONLY cart_id sent, and
 * resolves to whatever old (often already-converted) cart it pointed to.
 * That's the "cart item not found" / "your bag is empty" bug reported from
 * real browsing — findItem/checkout resolve a cart the page never showed.
 * Only `clearCartIdCookie` needs to sweep this: that's the sole moment the
 * current cookie's lifecycle actually ends (checkout, cart merge), which is
 * exactly the moment a surviving legacy duplicate would become the only
 * `cart_id` sent. Doing the same sweep from `setCartIdCookie` — on every
 * single cart mutation — was redundant for browsers (which already key
 * same-name cookies by path, so it fixed nothing extra) and actively
 * harmful for any HTTP client with a simpler, non-path-aware cookie jar
 * (e.g. the `cookiejar` package behind supertest's `.agent()`, which
 * treats the legacy path as colliding with `/api/v1` since one is a string
 * prefix of the other, and so deletes the just-set real cookie).
 */
const LEGACY_CART_ID_COOKIE_PATHS = ["/api/v1/cart"];

/**
 * Signed + httpOnly so the client can't forge a cart_id it doesn't own
 * (ADR-011) — same treatment as the auth module's refresh token cookie.
 * Scoped to /api/v1 (not just /api/v1/cart) — Week 1 Day 4's checkout
 * endpoint (/api/v1/orders/checkout) reads this same cookie to resolve a
 * guest's cart, so it can no longer be scoped to cart's own path alone.
 * orders' controller imports these same two functions rather than
 * duplicating the cookie config, so set/clear can never drift apart on path.
 */
export function setCartIdCookie(res: Response, cartId: string): void {
  res.cookie(CART_ID_COOKIE, cartId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1",
    maxAge: CART_COOKIE_MAX_AGE_MS,
  });
}

export function clearCartIdCookie(res: Response): void {
  res.clearCookie(CART_ID_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1",
  });
  clearLegacyCartIdCookies(res);
}

function clearLegacyCartIdCookies(res: Response): void {
  for (const path of LEGACY_CART_ID_COOKIE_PATHS) {
    res.clearCookie(CART_ID_COOKIE, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      signed: true,
      path,
    });
  }
}
