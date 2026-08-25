import type { Response } from "express";
import { env } from "../../../../config/env";

export const CART_ID_COOKIE = "cart_id";

// 30 days — long enough that "add to cart, come back tomorrow" survives, short
// enough that an abandoned guest cart doesn't linger forever (ADR-011).
const CART_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signed + httpOnly so the client can't forge a cart_id it doesn't own
 * (ADR-011) — same treatment as the auth module's refresh token cookie.
 * Scoped to /api/v1 (not just /api/v1/cart) — Week 1 Day 4's checkout
 * endpoint (/api/v1/orders/checkout) reads this same cookie to resolve a
 * guest's cart, so it can no longer be scoped to cart's own path alone.
 * orders' controller imports these same two functions rather than
 * duplicating the cookie config, so set/clear can never drift apart on path
 * (a mismatched Path is silently a no-op clear, not an error).
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
}
