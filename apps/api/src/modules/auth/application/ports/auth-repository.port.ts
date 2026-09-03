import type { EmailVerificationEntity } from "../../domain/entities/email-verification.entity";
import type { PasswordResetEntity } from "../../domain/entities/password-reset.entity";
import type { UserEntity } from "../../domain/entities/user.entity";

export interface CreateUserInput {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
}

/** A pending email-OTP registration row (see EmailVerification model / EmailVerificationEntity). */
export type EmailVerificationRecord = EmailVerificationEntity;

export interface UpsertEmailVerificationInput {
  email: string;
  codeHash: string;
  name: string;
  phone?: string;
  passwordHash: string;
  expiresAt: Date;
  lastSentAt: Date;
}

/**
 * A new code for an EXISTING live pending row — from `resend`, or from a
 * re-submitted `start` while the previous code is still valid. Bumps
 * `resendCount`, sets the new code/expiry/lastSentAt, and — critically —
 * does NOT reset `attempts` (that stays a hard lifetime cap, see
 * MAX_VERIFY_ATTEMPTS). `name`/`phone`/`passwordHash` are only supplied by
 * the re-`start` path, where the form may have changed.
 */
export interface RefreshEmailVerificationInput {
  email: string;
  codeHash: string;
  expiresAt: Date;
  lastSentAt: Date;
  name?: string;
  phone?: string | null;
  passwordHash?: string;
}

export interface UserWithPasswordHash {
  user: UserEntity;
  passwordHash: string | null;
}

/** An in-progress forgot-password reset row (see PasswordReset model / PasswordResetEntity). */
export type PasswordResetRecord = PasswordResetEntity;

export interface UpsertPasswordResetInput {
  email: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  lastSentAt: Date;
}

/**
 * A new code for an EXISTING live reset row — from `resend`, or from a
 * re-submitted `forgot` while the previous code is still valid. Bumps
 * `resendCount`, sets the new code/expiry/lastSentAt, and — like the
 * registration flow — does NOT reset `attempts` (a hard lifetime cap, see
 * MAX_VERIFY_ATTEMPTS).
 */
export interface RefreshPasswordResetInput {
  email: string;
  codeHash: string;
  expiresAt: Date;
  lastSentAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Week 2 Day 7 (week2 (1).md §19's admin "Customer list" row) — never the password hash or any auth-credential/token field, see UserEntity's own shape for why that's structurally impossible here (this is that same select, plus createdAt). */
export interface CustomerSummary {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ListCustomersFilter {
  /** Matches name or email. */
  search?: string;
  isActive?: boolean;
  /** Admin analytics dashboard (2026-09-03) — "new customers in range" reuses this same filter/count rather than a separate method; the admin customer list itself never sets these. */
  createdAfter?: Date;
  createdBefore?: Date;
  page: number;
  pageSize: number;
}

export interface ListCustomersResult {
  items: CustomerSummary[];
  total: number;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface AuthRepositoryPort {
  findUserByEmail(email: string): Promise<UserEntity | null>;
  findUserById(id: string): Promise<UserEntity | null>;
  /** Week 2 Day 3 (week2 (1).md §6) — the only User field editable via the profile endpoint; see UpdateUserProfileUseCase's own doc comment for why email/phone aren't here. */
  updateUserName(id: string, name: string): Promise<UserEntity>;
  /** Includes the PASSWORD auth credential's hash (or null if the user has none — e.g. future OTP-only accounts) in one query. */
  findUserWithPasswordHashByEmail(email: string): Promise<UserWithPasswordHash | null>;
  createUserWithPassword(input: CreateUserInput): Promise<UserEntity>;

  // ── Email-OTP registration (a pending registration lives on this row
  //    until the code is verified; no `users` row exists until then). ──
  /** Fresh start — used only when there's no live pending row (none, or the prior code expired/was consumed). Resets attempts/resendCount to 0 and clears consumedAt. */
  upsertEmailVerification(input: UpsertEmailVerificationInput): Promise<void>;
  findEmailVerificationByEmail(email: string): Promise<EmailVerificationRecord | null>;
  incrementEmailVerificationAttempts(email: string): Promise<void>;
  /** New code for an existing LIVE row (resend, or re-submitted start). resendCount++, new code/expiry/lastSentAt; `attempts` is deliberately NOT reset. */
  refreshEmailVerification(input: RefreshEmailVerificationInput): Promise<void>;
  deleteEmailVerification(email: string): Promise<void>;

  // ── Forgot-password email-OTP (an in-progress reset for an existing
  //    account; the row is deleted the moment the password is changed). ──
  /** Fresh reset request — used when there's no live row (none, or the prior code expired/was consumed). Resets attempts/resendCount to 0 and clears consumedAt. */
  upsertPasswordReset(input: UpsertPasswordResetInput): Promise<void>;
  findPasswordResetByEmail(email: string): Promise<PasswordResetRecord | null>;
  incrementPasswordResetAttempts(email: string): Promise<void>;
  /** New code for an existing LIVE row (resend, or re-submitted forgot). resendCount++, new code/expiry/lastSentAt; `attempts` is deliberately NOT reset. */
  refreshPasswordReset(input: RefreshPasswordResetInput): Promise<void>;
  deletePasswordReset(email: string): Promise<void>;
  /** Replace (or create) the user's PASSWORD credential hash — the reset flow's final write. */
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;

  /** tokenHash is the sha256 hex digest of the raw token — the raw token is never persisted (see RefreshToken model comment). */
  createRefreshToken(params: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  /** Reuse-detection response: a presented-but-already-revoked token means the token leaked — kill every session for that user. */
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;

  /** Week 2 Day 7 admin surface (week2 (1).md §19) — CUSTOMER role only, never staff/admin accounts (those are Module 17's "Staff" management, still coming-soon per apps/admin's own nav-config.ts). */
  findCustomersForAdmin(filter: ListCustomersFilter): Promise<ListCustomersResult>;
  /** Single-row counterpart to findCustomersForAdmin — same CustomerSummary shape (with createdAt), unlike findUserById's UserEntity. Returns null for a non-customer id; callers still do their own role check first since "not a customer" and "doesn't exist" are both a 404 here. */
  findCustomerSummaryById(id: string): Promise<CustomerSummary | null>;
  /** "Account status" (week2 (1).md §19) — activate/deactivate a customer account. Already has real teeth without any new enforcement: LoginUserUseCase and RefreshTokenUseCase both already check `isActive` (Week 1), so a deactivated customer can't log in again and their next refresh-rotation fails — only their current short-lived access token keeps working until it naturally expires. Returns CustomerSummary (not UserEntity) since the only caller is this same admin surface and the frontend needs createdAt for display. */
  setUserActive(id: string, isActive: boolean): Promise<CustomerSummary>;
}
