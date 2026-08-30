import type { Role } from "@woobe/types";
import type {
  LoginInput,
  RegisterStartInput,
  ResendOtpInput,
  VerifyOtpInput,
} from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

/** Returned by register/start + register/resend — no session yet, the account is created on verify. */
export interface RegistrationOtpChallenge {
  pending: true;
  expiresAt: string; // ISO
  resendAvailableAt: string; // ISO
  devCode?: string; // non-production only — no real email provider is wired
}

/** Step 1 of email-OTP registration — sends the code, creates nothing. */
export function startRegistration(
  input: RegisterStartInput,
): Promise<RegistrationOtpChallenge> {
  return apiFetch<RegistrationOtpChallenge>("/api/v1/auth/register/start", {
    method: "POST",
    body: input,
  });
}

/** Step 2 — verifies the code and creates the account (returns a real session). */
export function verifyRegistrationOtp(
  input: VerifyOtpInput,
): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/v1/auth/register/verify", {
    method: "POST",
    body: input,
  });
}

export function resendRegistrationOtp(
  input: ResendOtpInput,
): Promise<RegistrationOtpChallenge> {
  return apiFetch<RegistrationOtpChallenge>("/api/v1/auth/register/resend", {
    method: "POST",
    body: input,
  });
}

export function login(input: LoginInput): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: input,
  });
}

/** Relies on the httpOnly refresh cookie (sent via credentials:'include') — no token passed explicitly. */
export function refresh(): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>("/api/v1/auth/refresh", {
    method: "POST",
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
}

export function me(accessToken: string): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/v1/auth/me", { accessToken });
}
