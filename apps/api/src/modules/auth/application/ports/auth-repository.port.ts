import type { Role } from "@woobe/types";
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

/** "Continue with Google" — creates a brand-new customer with a GOOGLE AuthCredential (no password). */
export interface CreateGoogleUserInput {
  email: string;
  name: string;
  providerSubject: string;
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

// ── Staff Management System (2026-09-06) ──────────────────────────────────

/** Derived, never stored: DEACTIVATED beats everything else regardless of invitation state; otherwise ACTIVE once a PASSWORD credential exists (activation complete), INVITED until then. Same "has a PASSWORD AuthCredential" fact LoginUserUseCase's own guard already keys off. */
export type StaffStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

/** Never the password hash or any credential/token field — same allowlist discipline as CustomerSummary. */
export interface StaffSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  status: StaffStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface ListStaffFilter {
  /** Matches name or email. */
  search?: string;
  role?: Role;
  status?: StaffStatus;
}

/** CreateStaffUseCase's one nested-write call — creates the User row AND its StaffInvitation atomically (Prisma nested create, not a manual transaction; see AuthRepository.createStaffUser's own comment). No AuthCredential yet — that's what activation later creates. */
export interface CreateStaffInput {
  email: string;
  name: string;
  role: Role;
  invitedById: string;
  codeHash: string;
  expiresAt: Date;
}

/** A staff account's invitation/activation row — see StaffInvitation model's own doc comment for why this isn't just a reused PasswordReset row. */
export interface StaffInvitationRecord {
  userId: string;
  invitedById: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}

export interface RefreshStaffInvitationInput {
  userId: string;
  codeHash: string;
  expiresAt: Date;
  lastSentAt: Date;
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
  /** Reuse-detection response: a presented-but-already-revoked token means the token leaked — kill every session for that user. `tx` lets the Staff module's role-change/deactivate use-cases revoke atomically alongside the User update + audit write (see runWithLockedActiveSuperAdmins). */
  revokeAllRefreshTokensForUser(userId: string, tx?: unknown): Promise<void>;

  /** Week 2 Day 7 admin surface (week2 (1).md §19) — CUSTOMER role only, never staff/admin accounts (those are Module 17's "Staff" management, still coming-soon per apps/admin's own nav-config.ts). */
  findCustomersForAdmin(filter: ListCustomersFilter): Promise<ListCustomersResult>;
  /** Single-row counterpart to findCustomersForAdmin — same CustomerSummary shape (with createdAt), unlike findUserById's UserEntity. Returns null for a non-customer id; callers still do their own role check first since "not a customer" and "doesn't exist" are both a 404 here. */
  findCustomerSummaryById(id: string): Promise<CustomerSummary | null>;
  /** "Account status" (week2 (1).md §19) — activate/deactivate a customer OR staff account (this method itself is role-agnostic; SetCustomerActiveUseCase/SetStaffActiveUseCase each scope who's allowed to call it). Already has real teeth without any new enforcement: LoginUserUseCase and RefreshTokenUseCase both already check `isActive` (Week 1), so a deactivated account can't log in again and its next refresh-rotation fails — only its current short-lived access token keeps working until it naturally expires. Returns CustomerSummary (not UserEntity) since the frontend needs createdAt for display; `tx` lets Staff's last-super-admin-safe path run this atomically with the lock check + audit write. */
  setUserActive(id: string, isActive: boolean, tx?: unknown): Promise<CustomerSummary>;

  // ── "Continue with Google" (2026-09-05) ──
  /** Looks a user up by their linked Google account's stable `sub` — the only identifier ever used for Google account lookup/linking (never email alone). */
  findUserByGoogleSubject(providerSubject: string): Promise<UserEntity | null>;
  /** Creates a brand-new customer with a GOOGLE AuthCredential (no password). Throws ConflictError on a unique-constraint race (email or providerSubject already taken) — the use-case has already checked for an email conflict, this is a TOCTOU backstop, same pattern as createUserWithPassword. */
  createUserWithGoogle(input: CreateGoogleUserInput): Promise<UserEntity>;
  /** Authenticated account-linking: attaches (or replaces) the caller's OWN GOOGLE credential. Throws ConflictError if this Google account is already linked to a DIFFERENT user (providerSubject unique constraint). */
  linkGoogleAccount(userId: string, providerSubject: string): Promise<void>;

  /** Set from LoginUserUseCase on every successful login (customer or staff) — never on a failed attempt or a token refresh. */
  updateLastLoginAt(id: string): Promise<void>;

  // ── Staff Management System (2026-09-06) — MANAGE_STAFF surface, staff's own module composes these directly (same "sibling module imports auth's exported repository" shape `users` already uses). Every method here is scoped to non-CUSTOMER roles; the staff module's own use-cases are what enforce that a given id is actually staff before calling in. ──
  findStaffForAdmin(filter: ListStaffFilter): Promise<StaffSummary[]>;
  findStaffSummaryById(id: string): Promise<StaffSummary | null>;
  /** One nested Prisma write — creates the User AND its StaffInvitation atomically without a manual $transaction (see AuthRepository's own comment). Throws ConflictError on a duplicate email (DB constraint, TOCTOU-safe). */
  createStaffUser(input: CreateStaffInput): Promise<StaffSummary>;
  /** `tx` required only on the last-super-admin-safe path (runWithLockedActiveSuperAdmins) — omit for a plain role change that can't reduce the active-super-admin count. */
  changeUserRole(id: string, role: Role, tx?: unknown): Promise<StaffSummary>;

  findStaffInvitationByEmail(email: string): Promise<StaffInvitationRecord | null>;
  findStaffInvitationByUserId(userId: string): Promise<StaffInvitationRecord | null>;
  incrementStaffInvitationAttempts(userId: string): Promise<void>;
  /** Resend — bumps resendCount, sets a new code/expiry/lastSentAt; `attempts` is deliberately NOT reset (hard lifetime cap, same rule every other OTP-shaped flow in this codebase follows). */
  refreshStaffInvitation(input: RefreshStaffInvitationInput): Promise<void>;
  /** Activation's final step: creates the PASSWORD AuthCredential and marks the invitation consumed, atomically. The row is kept (not deleted) — see StaffInvitation model's own doc comment on why this stays auditable. */
  consumeStaffInvitationAndSetPassword(input: { userId: string; passwordHash: string }): Promise<void>;

  /** Plain atomicity (update + audit write together) with no row locking — use whenever the mutation can't possibly reduce the active-super-admin count. */
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /**
   * Row-locks every currently-active SUPER_ADMIN (`SELECT ... FOR UPDATE`)
   * inside one transaction, then hands their ids + the tx handle to `fn` —
   * the only way to safely serialize two concurrent deactivate/demote
   * requests that could otherwise both read "2 active super admins" and
   * both proceed, leaving zero (a plain count-then-update races under
   * Postgres MVCC; see ChangeStaffRoleUseCase/SetStaffActiveUseCase's own
   * comments for exactly when this path is required vs. plain `transaction`).
   */
  runWithLockedActiveSuperAdmins<T>(fn: (lockedActiveSuperAdminIds: string[], tx: unknown) => Promise<T>): Promise<T>;
}
