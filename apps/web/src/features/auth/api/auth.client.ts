import type { Role } from "@woobe/types";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterStartInput,
  ResendOtpInput,
  ResendPasswordResetOtpInput,
  ResetPasswordInput,
  VerifyOtpInput,
  VerifyResetOtpInput,
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

/** `/auth/google`'s response — a normal session plus whether this call created the account, so the caller can pick "Welcome to Woobe!" vs "Welcome back!" copy. */
export interface GoogleAuthSession extends AuthSession {
  isNewUser: boolean;
}

/**
 * The response every OTP "send a code" endpoint returns — no session yet.
 * Shared by register/start + register/resend (account created on verify)
 * and forgot-password + reset-password/resend (password changed on reset).
 */
export interface OtpChallenge {
  pending: true;
  expiresAt: string; // ISO
  resendAvailableAt: string; // ISO
  devCode?: string; // non-production only — no real email provider is wired
}

/** Step 1 of email-OTP registration — sends the code, creates nothing. */
export function startRegistration(
  input: RegisterStartInput,
): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/api/v1/auth/register/start", {
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
): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/api/v1/auth/register/resend", {
    method: "POST",
    body: input,
  });
}

/**
 * Step 1 of forgot-password — emails a reset code. Always resolves the same
 * way whether or not the email has an account (no enumeration).
 */
export function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: input,
  });
}

/** Step 2 — confirms the code is right before the new-password screen. Resolves on success, throws (422) otherwise. Doesn't consume the code. */
export function verifyPasswordResetOtp(input: VerifyResetOtpInput): Promise<void> {
  return apiFetch<void>("/api/v1/auth/reset-password/verify", {
    method: "POST",
    body: input,
  });
}

/** Step 3 — submits the verified code with the new password. No session is returned; the user logs in afterwards. */
export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return apiFetch<void>("/api/v1/auth/reset-password", {
    method: "POST",
    body: input,
  });
}

export function resendPasswordResetOtp(
  input: ResendPasswordResetOtpInput,
): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>("/api/v1/auth/reset-password/resend", {
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

/**
 * Continue with Google — the only thing ever sent is the opaque ID token
 * (JWT) Google Identity Services hands back to its own callback; the
 * server is the sole authority on the email/name/picture it decodes from
 * that credential. 200 (existing user) or 201 (new user) either way, both
 * carrying a normal session plus `isNewUser` for the caller's toast copy.
 */
export function authenticateWithGoogle(
  credential: string,
): Promise<GoogleAuthSession> {
  return apiFetch<GoogleAuthSession>("/api/v1/auth/google", {
    method: "POST",
    body: { credential },
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
