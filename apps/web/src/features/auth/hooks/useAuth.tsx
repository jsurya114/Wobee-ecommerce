"use client";

import type { LoginInput, VerifyOtpInput } from "@woobe/validation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { setUnauthorizedHandler } from "@/lib/api-client";
import * as authApi from "../api/auth.client";
import type { AuthUser } from "../api/auth.client";
import { refreshAccessToken } from "../api/refresh-coordinator";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  /** Finishes email-OTP registration: verifies the code, which is what actually creates the account and starts the session. Step 1 (send code) is a plain authApi call — it touches no auth state. */
  verifyRegistrationOtp: (input: VerifyOtpInput) => Promise<void>;
  /** Continue with Google — verifies server-side; returns whether this created a new account, for the caller's own toast copy. */
  authenticateWithGoogle: (credential: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and updates the in-memory user — for a feature that mutates the profile through a DIFFERENT endpoint (Week 2 Day 3's PATCH /users/me) to refresh what this context holds, without a full re-login. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Access token lives ONLY in memory (React state) — never localStorage, so
 * it isn't readable by an XSS payload that persists across page loads. The
 * refresh token (httpOnly cookie, invisible to JS entirely) is what
 * survives a reload: on mount, we silently call /auth/refresh to turn that
 * cookie back into a fresh access token, restoring the session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Goes through the shared coordinator, not authApi.refresh()
        // directly — the refresh token is single-use/rotating, so this
        // mount effect racing a concurrent 401-triggered refresh (or its
        // own React-StrictMode double-invoke) must never fire two real
        // /auth/refresh calls (see refresh-coordinator.ts's own comment).
        const { accessToken: freshToken } = await refreshAccessToken();
        const { user: freshUser } = await authApi.me(freshToken);
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

  // Lets apiFetch silently recover from an expired (not merely absent)
  // access token instead of throwing an uncaught 401 on the first
  // authenticated call after 15 minutes — see setUnauthorizedHandler's own
  // doc comment in lib/api-client.ts. Registered once, at the top of the
  // provider tree, so it's live before any child's own effect could fire
  // its first authenticated request.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      try {
        const { accessToken: freshToken } = await refreshAccessToken();
        setAccessToken(freshToken);
        return freshToken;
      } catch {
        // The refresh token itself is invalid/expired/revoked — a genuine
        // logged-out state, not a retryable hiccup. Reflect that in
        // context so the rest of the UI (nav, guarded pages) reacts the
        // same way an explicit logout would, then let the caller's
        // original 401 surface normally.
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
        return null;
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await authApi.login(input);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const verifyRegistrationOtp = useCallback(async (input: VerifyOtpInput) => {
    const session = await authApi.verifyRegistrationOtp(input);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const authenticateWithGoogle = useCallback(async (credential: string) => {
    const session = await authApi.authenticateWithGoogle(credential);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
    return session.isNewUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!accessToken) return;
    const { user: freshUser } = await authApi.me(accessToken);
    setUser(freshUser);
  }, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        status,
        login,
        verifyRegistrationOtp,
        authenticateWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
