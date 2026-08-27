"use client";

import type { LoginInput } from "@woobe/validation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as adminAuthApi from "../api/admin-auth.client";
import type { AdminUser } from "../api/admin-auth.client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  user: AdminUser | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/** Mirrors apps/web's AuthProvider exactly (same in-memory-access-token / httpOnly-refresh-cookie split) — see that file's own comment for why. */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

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

  return <AdminAuthContext.Provider value={{ user, accessToken, status, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  }
  return ctx;
}
