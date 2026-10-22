import { singleFlight } from "@woobe/utils";
import * as adminAuthApi from "./admin-auth.client";

/**
 * The ONLY way the admin app refreshes its session (fix for the production
 * "admin logged out after a few minutes" bug, 2026-09-29).
 *
 * Root cause: the admin refresh token is single-use and rotated on every
 * `/admin/auth/refresh` (RefreshTokenUseCase), and presenting an
 * already-rotated one is treated as theft — the API revokes EVERY session
 * for that admin. When the 15-minute access token expired, a page firing
 * several queries at once (the dashboard fires many) got several 401s, and
 * `withFreshToken` started one refresh per 401, all carrying the same
 * cookie. The first rotated it; the rest looked like replays; the admin was
 * signed out everywhere. apps/web fixed the identical race on 2026-08-30
 * (its refresh-coordinator.ts); the admin app never got the fix.
 *
 * Two layers, neither weakening rotation or reuse detection:
 * - `singleFlight`: within a tab, every concurrent caller awaits one call.
 * - Web Locks (where supported): across tabs of the same browser, refreshes
 *   run one after another, so a second tab always sends the cookie the first
 *   tab's refresh just set, never the rotated-out one.
 */
const REFRESH_LOCK_NAME = "woobe-admin-session-refresh";

async function refreshSerializedAcrossTabs(): Promise<{ accessToken: string }> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    // lib.dom types request() as Promise<callback's return type>; `await` unwraps it.
    return await navigator.locks.request(REFRESH_LOCK_NAME, () => adminAuthApi.refresh());
  }
  return adminAuthApi.refresh();
}

export const refreshAdminSession = singleFlight(refreshSerializedAcrossTabs);
