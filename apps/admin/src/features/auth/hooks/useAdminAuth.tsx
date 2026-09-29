"use client";

import type { LoginInput } from "@woobe/validation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import * as adminAuthApi from "../api/admin-auth.client";
import { refreshAdminSession } from "../api/refresh-coordinator";
import type { AdminUser } from "../api/admin-auth.client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  user: AdminUser | null;
  accessToken: string | null;
  status: AuthStatus;
  /** Returns the logged-in user so the caller can decide where to send them — not every role has permission for the same landing page (see LoginForm's own use of this). */
  login: (input: LoginInput) => Promise<AdminUser>;
  logout: () => Promise<void>;
  /**
   * Runs `fn` with the current access token; on a 401 (the in-memory token
   * expired — there is no proactive renewal, only this reactive one) it
   * silently refreshes once and retries `fn` with the new token. Every
   * authenticated call site (queries, mutations, the raw-fetch media upload)
   * should go through this instead of reading `accessToken` directly, so an
   * expired token self-heals instead of silently no-oping or surfacing a
   * generic error. If the API rejects the refresh (401/403) the session
   * really is over: status flips to "unauthenticated" (the dashboard layout
   * redirects). A network error/5xx during refresh is rethrown without
   * ending the session (see refreshOrEndSession).
   */
  withFreshToken: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/** Mirrors apps/web's AuthProvider exactly (same in-memory-access-token / httpOnly-refresh-cookie split) — see that file's own comment for why. */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Shared with withFreshToken below — never a second concurrent refresh (refresh-coordinator.ts).
        const { accessToken: freshToken } = await refreshAdminSession();
        const { user: freshUser } = await adminAuthApi.me(freshToken);
        if (cancelled) return;
        setAccessToken(freshToken);
        setUser(freshUser);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await adminAuthApi.login(input);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminAuthApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const endSession = useCallback(() => {
    accessTokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  /**
   * Gets a new access token through the shared coordinator. Only a refresh
   * the API actually REJECTS (401/403 — cookie missing, expired, revoked)
   * ends the session. A network error or a 5xx (e.g. the API restarting
   * during a deploy) is rethrown as-is and leaves the session alone, so
   * the next request can try again with the still-valid cookie.
   */
  const refreshOrEndSession = useCallback(async (): Promise<string> => {
    try {
      const { accessToken: fresh } = await refreshAdminSession();
      accessTokenRef.current = fresh;
      setAccessToken(fresh);
      return fresh;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && (refreshError.status === 401 || refreshError.status === 403)) {
        endSession();
      }
      throw refreshError;
    }
  }, [endSession]);

  const withFreshToken = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const usedToken = accessTokenRef.current;
      if (!usedToken) {
        return fn(await refreshOrEndSession());
      }

      try {
        return await fn(usedToken);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        // Another request may already have refreshed while this one was in
        // flight — reuse that token instead of spending another rotation.
        const current = accessTokenRef.current;
        const fresh = current && current !== usedToken ? current : await refreshOrEndSession();
        // Errors from the retried call itself (a 400/422 on a form save, a
        // 404…) are ordinary request errors and never end the session.
        return fn(fresh);
      }
    },
    [refreshOrEndSession],
  );

  return (
    <AdminAuthContext.Provider value={{ user, accessToken, status, login, logout, withFreshToken }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  }
  return ctx;
}
