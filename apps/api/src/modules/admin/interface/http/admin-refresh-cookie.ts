import type { Response } from "express";
import { env } from "../../../../config/env";

export const ADMIN_REFRESH_TOKEN_COOKIE = "admin_refresh_token";

/**
 * Deliberately a SEPARATE cookie from the customer `refresh_token`
 * (ADR-025 §4.6) — both are httpOnly/secure/signed identically, but this
 * one is scoped to `/api/v1/admin` (never sent to `/api/v1/auth/*`, never
 * collides with a customer session in the same browser) and uses
 * `sameSite: "strict"` rather than the customer cookie's `"lax"` —
 * deliberately stricter, justified by the higher-privilege admin session
 * (order cancellation, refunds) having no legitimate cross-site entry
 * point the way a payment-gateway redirect back to the storefront might.
 */
export function setAdminRefreshTokenCookie(res: Response, rawToken: string, expiresAt: Date): void {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    path: "/api/v1/admin",
    expires: expiresAt,
  });
}

export function clearAdminRefreshTokenCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    path: "/api/v1/admin",
  });
}
