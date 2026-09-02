"use client";

import type { LoginInput } from "@woobe/validation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import * as adminAuthApi from "../api/admin-auth.client";
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
   * generic error. If refresh itself fails, the session really is over:
   * status flips to "unauthenticated" (the dashboard layout redirects) and
   * the original 401 is rethrown for the caller's own error state.
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
        const { accessToken: freshToken } = await adminAuthApi.refresh();
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

  const withFreshToken = useCallback(async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    const attempt = async (token: string) => fn(token);

    if (!accessTokenRef.current) {
      try {
        const { accessToken: fresh } = await adminAuthApi.refresh();
        accessTokenRef.current = fresh;
        setAccessToken(fresh);
        return await attempt(fresh);
      } catch (err) {
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
        throw err;
      }
    }

    try {
      return await attempt(accessTokenRef.current);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      try {
        const { accessToken: fresh } = await adminAuthApi.refresh();
        accessTokenRef.current = fresh;
        setAccessToken(fresh);
        return await attempt(fresh);
      } catch {
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
        throw err;
      }
    }
  }, []);

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
