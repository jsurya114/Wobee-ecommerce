import type { Permission, Role } from "@woobe/types";
import type { LoginInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
}

export interface AdminSession {
  user: AdminUser;
  accessToken: string;
}

export function login(input: LoginInput): Promise<AdminSession> {
  return apiFetch<AdminSession>("/api/v1/admin/auth/login", { method: "POST", body: input });
}

/**
 * Relies on the httpOnly admin_refresh_token cookie (sent via credentials:'include').
 * `keepalive` (2026-09-29): the refresh token rotates on every call, so a
 * request cut off by a tab closing or reloading mid-refresh used to lose the
 * new cookie and leave the browser holding a dead one. A keepalive request
 * outlives the page, so the browser still stores the rotated cookie.
 */
export function refresh(): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>("/api/v1/admin/auth/refresh", { method: "POST", keepalive: true });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/admin/auth/logout", { method: "POST" });
}

export function me(accessToken: string): Promise<{ user: AdminUser }> {
  return apiFetch<{ user: AdminUser }>("/api/v1/admin/auth/me", { accessToken });
}

export type { Permission };
