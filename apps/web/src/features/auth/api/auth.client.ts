import type { LoginInput, RegisterInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export function register(input: RegisterInput): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/v1/auth/register", { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/v1/auth/login", { method: "POST", body: input });
}

/** Relies on the httpOnly refresh cookie (sent via credentials:'include') — no token passed explicitly. */
export function refresh(): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>("/api/v1/auth/refresh", { method: "POST" });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
}

export function me(accessToken: string): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/v1/auth/me", { accessToken });
}
