import type { Response } from "express";
import { env } from "../../../../config/env";

export const CART_ID_COOKIE = "cart_id";

// 30 days — long enough that "add to cart, come back tomorrow" survives, short
// enough that an abandoned guest cart doesn't linger forever (ADR-011).
const CART_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signed + httpOnly so the client can't forge a cart_id it doesn't own
 * (ADR-011) — same treatment as the auth module's refresh token cookie.
 * Scoped to /api/v1/cart, the only paths that ever need to read it.
 */
export function setCartIdCookie(res: Response, cartId: string): void {
  res.cookie(CART_ID_COOKIE, cartId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1/cart",
    maxAge: CART_COOKIE_MAX_AGE_MS,
  });
}

export function clearCartIdCookie(res: Response): void {
  res.clearCookie(CART_ID_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1/cart",
  });
}
