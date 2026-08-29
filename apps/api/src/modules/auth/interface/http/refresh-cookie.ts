import type { Response } from "express";
import { env } from "../../../../config/env";

export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * httpOnly + signed so it's neither readable nor tamperable from client JS
 * or a naive request forgery (ADR-018). Scoped to /api/v1/auth — the only
 * paths that ever need to read it (refresh, logout).
 */
export function setRefreshTokenCookie(res: Response, rawToken: string, expiresAt: Date): void {
  res.cookie(REFRESH_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1/auth",
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/api/v1/auth",
  });
}
