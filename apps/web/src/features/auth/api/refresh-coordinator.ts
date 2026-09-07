import * as authApi from "./auth.client";

/**
 * Single in-flight `/auth/refresh` call, shared by every caller that needs
 * one — `AuthProvider`'s own silent-refresh-on-mount effect and
 * `apiFetch`'s 401-retry-once path (see `setUnauthorizedHandler` in
 * `lib/api-client.ts`) both go through this instead of calling
 * `authApi.refresh()` directly.
 *
 * This is load-bearing, not just an optimization: the refresh token is
 * opaque, single-use, and rotated on every call
 * (`RefreshTokenUseCase` — the httpOnly cookie is revoked the instant it's
 * read and replaced with a new one). A SECOND concurrent call presenting
 * that same, now-already-rotated cookie is indistinguishable from a
 * stolen/replayed token to the server, which responds by revoking every
 * refresh token for the user — logging them out everywhere, not just
 * failing the one request. This exact risk was already identified for
 * `AuthProvider`'s mount effect (journal.md, 2026-08-30 "Reconciliation"
 * entry) — flagged but not fixed at the time since it wasn't the reported
 * bug. Fixed here, for both call sites at once, by making "more than one
 * refresh in flight" structurally impossible: every caller within the
 * window awaits the exact same Promise instead of starting their own.
 */
let pendingRefresh: Promise<{ accessToken: string }> | null = null;

export function refreshAccessToken(): Promise<{ accessToken: string }> {
  if (!pendingRefresh) {
    pendingRefresh = authApi.refresh().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}
