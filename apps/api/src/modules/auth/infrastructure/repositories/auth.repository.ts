import { AuthMethod, Prisma, prisma, Role } from "@woobe/database";
import { ConflictError } from "../../../../shared/errors";
import type {
  AuthRepositoryPort,
  CreateGoogleUserInput,
  CreateStaffInput,
  CreateUserInput,
  CustomerSummary,
  EmailVerificationRecord,
  ListCustomersFilter,
  ListCustomersResult,
  ListStaffFilter,
  PasswordResetRecord,
  RefreshEmailVerificationInput,
  RefreshPasswordResetInput,
  RefreshStaffInvitationInput,
  RefreshTokenRecord,
  StaffInvitationRecord,
  StaffSummary,
  UpsertEmailVerificationInput,
  UpsertPasswordResetInput,
  UserWithPasswordHash,
} from "../../application/ports/auth-repository.port";
import type { UserEntity } from "../../domain/entities/user.entity";

/**
 * ADR-010: the ONLY file in the auth module allowed to import @woobe/database
 * (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class AuthRepository implements AuthRepositoryPort {
  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? toEntity(user) : null;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? toEntity(user) : null;
  }

  async findUserWithPasswordHashByEmail(email: string): Promise<UserWithPasswordHash | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { authCredentials: { where: { method: AuthMethod.PASSWORD } } },
    });
    if (!user) return null;
    return {
      user: toEntity(user),
      passwordHash: user.authCredentials[0]?.passwordHash ?? null,
    };
  }

  async createUserWithPassword(input: CreateUserInput): Promise<UserEntity> {
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone,
          authCredentials: {
            create: {
              method: AuthMethod.PASSWORD,
              passwordHash: input.passwordHash,
            },
          },
        },
      });
      return toEntity(user);
    } catch (error) {
      // P2002 (unique constraint) — the use-case's own findUserByEmail check is
      // TOCTOU-racy under concurrent registration; the DB constraint is the real guard.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("An account with this email already exists");
      }
      throw error;
    }
  }

  async updateUserName(id: string, name: string): Promise<UserEntity> {
    // Not wrapped in a NotFoundError-mapping try/catch like update() elsewhere
    // in this codebase (e.g. collection.repository.ts) — the caller is always
    // resolving their OWN id from a verified access token (see
    // UpdateUserProfileUseCase), so a P2025 here would mean the token outlived
    // the account, not a normal user-facing 404 path worth a bespoke message for.
    const user = await prisma.user.update({ where: { id }, data: { name } });
    return toEntity(user);
  }

  async createRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const row = await prisma.refreshToken.create({ data: params });
    return toRefreshTokenRecord(row);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRefreshTokenRecord(row) : null;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { id, revokedAt: null }, // idempotent — no-op if already revoked
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllRefreshTokensForUser(userId: string, tx?: unknown): Promise<void> {
    await client(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async upsertEmailVerification(input: UpsertEmailVerificationInput): Promise<void> {
    const pending = {
      codeHash: input.codeHash,
      name: input.name,
      phone: input.phone ?? null,
      passwordHash: input.passwordHash,
      expiresAt: input.expiresAt,
      lastSentAt: input.lastSentAt,
    };
    await prisma.emailVerification.upsert({
      where: { email: input.email },
      create: { email: input.email, ...pending },
      // Only ever reached when the previous row is dead (expired/consumed) — the
      // use-case checks that first. A genuine fresh start, so the counters
      // (including `attempts`, the hard lifetime cap) reset to zero.
      update: { ...pending, attempts: 0, resendCount: 0, consumedAt: null },
    });
  }

  async findEmailVerificationByEmail(email: string): Promise<EmailVerificationRecord | null> {
    const row = await prisma.emailVerification.findUnique({ where: { email } });
    return row ? toEmailVerificationRecord(row) : null;
  }

  async incrementEmailVerificationAttempts(email: string): Promise<void> {
    // updateMany so a row that vanished mid-flight is a no-op, not a P2025.
    await prisma.emailVerification.updateMany({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
  }

  async refreshEmailVerification(input: RefreshEmailVerificationInput): Promise<void> {
    // updateMany so a row that vanished mid-flight is a no-op, not a P2025.
    // `attempts` is deliberately NOT reset here — it's a hard lifetime cap for
    // the pending registration, so a resend or a re-submitted `start` while the
    // row is still live cannot buy the caller a fresh set of guesses.
    await prisma.emailVerification.updateMany({
      where: { email: input.email },
      data: {
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        lastSentAt: input.lastSentAt,
        resendCount: { increment: 1 },
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
      },
    });
  }

  async deleteEmailVerification(email: string): Promise<void> {
    await prisma.emailVerification.deleteMany({ where: { email } });
  }

  async upsertPasswordReset(input: UpsertPasswordResetInput): Promise<void> {
    const row = {
      userId: input.userId,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      lastSentAt: input.lastSentAt,
    };
    await prisma.passwordReset.upsert({
      where: { email: input.email },
      create: { email: input.email, ...row },
      // Only ever reached when the previous row is dead (expired/consumed) —
      // the use-case checks that first. A genuine fresh request, so the
      // counters (including `attempts`, the hard lifetime cap) reset to zero.
      update: { ...row, attempts: 0, resendCount: 0, consumedAt: null },
    });
  }

  async findPasswordResetByEmail(email: string): Promise<PasswordResetRecord | null> {
    const row = await prisma.passwordReset.findUnique({ where: { email } });
    return row ? toPasswordResetRecord(row) : null;
  }

  async incrementPasswordResetAttempts(email: string): Promise<void> {
    // updateMany so a row that vanished mid-flight is a no-op, not a P2025.
    await prisma.passwordReset.updateMany({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
  }

  async refreshPasswordReset(input: RefreshPasswordResetInput): Promise<void> {
    // `attempts` is deliberately NOT reset — it's a hard lifetime cap, so a
    // resend or a re-submitted `forgot` while the row is still live cannot
    // buy the caller a fresh set of guesses (see MAX_VERIFY_ATTEMPTS).
    await prisma.passwordReset.updateMany({
      where: { email: input.email },
      data: {
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        lastSentAt: input.lastSentAt,
        resendCount: { increment: 1 },
      },
    });
  }

  async deletePasswordReset(email: string): Promise<void> {
    await prisma.passwordReset.deleteMany({ where: { email } });
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.authCredential.upsert({
      where: { userId_method: { userId, method: AuthMethod.PASSWORD } },
      create: { userId, method: AuthMethod.PASSWORD, passwordHash },
      update: { passwordHash },
    });
  }

  async findCustomersForAdmin(filter: ListCustomersFilter): Promise<ListCustomersResult> {
    const where: Prisma.UserWhereInput = {
      role: Role.CUSTOMER,
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.createdAfter || filter.createdBefore
        ? { createdAt: { ...(filter.createdAfter ? { gte: filter.createdAfter } : {}), ...(filter.createdBefore ? { lte: filter.createdBefore } : {}) } }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              { email: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items: CustomerSummary[] = rows;
    return { items, total };
  }

  async findCustomerSummaryById(id: string): Promise<CustomerSummary | null> {
    const user = await prisma.user.findFirst({
      where: { id, role: Role.CUSTOMER },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });
    return user;
  }

  async setUserActive(id: string, isActive: boolean, tx?: unknown): Promise<CustomerSummary> {
    return client(tx).user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findUserByGoogleSubject(providerSubject: string): Promise<UserEntity | null> {
    const credential = await prisma.authCredential.findUnique({
      where: { providerSubject },
      include: { user: true },
    });
    return credential ? toEntity(credential.user) : null;
  }

  async createUserWithGoogle(input: CreateGoogleUserInput): Promise<UserEntity> {
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          authCredentials: {
            create: { method: AuthMethod.GOOGLE, providerSubject: input.providerSubject },
          },
        },
      });
      return toEntity(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("An account with this email already exists");
      }
      throw error;
    }
  }

  async linkGoogleAccount(userId: string, providerSubject: string): Promise<void> {
    try {
      await prisma.authCredential.upsert({
        where: { userId_method: { userId, method: AuthMethod.GOOGLE } },
        create: { userId, method: AuthMethod.GOOGLE, providerSubject },
        update: { providerSubject },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This Google account is already linked to a different user");
      }
      throw error;
    }
  }

  async updateLastLoginAt(id: string): Promise<void> {
    // updateMany so a race with e.g. a concurrent deactivation is a no-op, not a crash.
    await prisma.user.updateMany({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  // ── Staff Management System (2026-09-06) ──

  async findStaffForAdmin(filter: ListStaffFilter): Promise<StaffSummary[]> {
    const where: Prisma.UserWhereInput = {
      role: filter.role ?? { not: Role.CUSTOMER },
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              { email: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...staffStatusWhere(filter.status),
    };

    const rows = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: staffSelect,
    });
    return rows.map(toStaffSummary);
  }

  async findStaffSummaryById(id: string): Promise<StaffSummary | null> {
    const row = await prisma.user.findFirst({
      where: { id, role: { not: Role.CUSTOMER } },
      select: staffSelect,
    });
    return row ? toStaffSummary(row) : null;
  }

  async createStaffUser(input: CreateStaffInput): Promise<StaffSummary> {
    try {
      // A single nested Prisma write — the User row and its StaffInvitation
      // are created in one atomic query tree, no manual $transaction needed
      // (Prisma nested creates are already all-or-nothing). No AuthCredential
      // yet: that's exactly what ActivateStaffUseCase creates later.
      const row = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          staffInvitation: {
            create: {
              invitedById: input.invitedById,
              codeHash: input.codeHash,
              expiresAt: input.expiresAt,
            },
          },
        },
        select: staffSelect,
      });
      return toStaffSummary(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A staff account with this email already exists");
      }
      throw error;
    }
  }

  async changeUserRole(id: string, role: Role, tx?: unknown): Promise<StaffSummary> {
    const row = await client(tx).user.update({ where: { id }, data: { role }, select: staffSelect });
    return toStaffSummary(row);
  }

  async findStaffInvitationByEmail(email: string): Promise<StaffInvitationRecord | null> {
    const row = await prisma.user.findUnique({ where: { email }, select: { staffInvitation: true } });
    return row?.staffInvitation ? toStaffInvitationRecord(row.staffInvitation) : null;
  }

  async findStaffInvitationByUserId(userId: string): Promise<StaffInvitationRecord | null> {
    const row = await prisma.staffInvitation.findUnique({ where: { userId } });
    return row ? toStaffInvitationRecord(row) : null;
  }

  async incrementStaffInvitationAttempts(userId: string): Promise<void> {
    await prisma.staffInvitation.updateMany({ where: { userId }, data: { attempts: { increment: 1 } } });
  }

  async refreshStaffInvitation(input: RefreshStaffInvitationInput): Promise<void> {
    // `attempts` deliberately NOT reset — same hard-lifetime-cap rule every
    // other OTP-shaped flow in this codebase follows (see otp.policy.ts).
    await prisma.staffInvitation.updateMany({
      where: { userId: input.userId },
      data: {
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        lastSentAt: input.lastSentAt,
        resendCount: { increment: 1 },
      },
    });
  }

  async consumeStaffInvitationAndSetPassword(input: { userId: string; passwordHash: string }): Promise<void> {
    // One transaction: creating the PASSWORD credential and marking the
    // invitation consumed must both happen or neither does — a crash between
    // the two would otherwise leave an account with a password but a still-
    // "pending" invitation (blocks nothing, but corrupts the audit trail).
    await prisma.$transaction([
      prisma.authCredential.create({
        data: { userId: input.userId, method: AuthMethod.PASSWORD, passwordHash: input.passwordHash },
      }),
      prisma.staffInvitation.update({ where: { userId: input.userId }, data: { consumedAt: new Date() } }),
    ]);
  }

  async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => fn(tx));
  }

  async runWithLockedActiveSuperAdmins<T>(fn: (lockedActiveSuperAdminIds: string[], tx: unknown) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      // Locks every currently-active super-admin row for the lifetime of
      // this transaction — a second, concurrent call to this same method
      // blocks here until the first commits (or rolls back), so the two
      // requests are serialized instead of both reading a stale count. See
      // this method's own doc comment on the port interface for why a plain
      // count-then-update isn't safe under Postgres MVCC.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "users" WHERE role = 'SUPER_ADMIN'::"Role" AND "isActive" = true FOR UPDATE
      `;
      return fn(
        rows.map((r) => r.id),
        tx,
      );
    });
  }
}

/** Resolves to the transactional client when `tx` is a live Prisma transaction handle, otherwise the module-level singleton — the same optional-tx pattern RecordAuditLogUseCase already established. */
function client(tx?: unknown): Prisma.TransactionClient | typeof prisma {
  return (tx as Prisma.TransactionClient | undefined) ?? prisma;
}

const staffSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  authCredentials: { where: { method: AuthMethod.PASSWORD }, select: { id: true } },
} satisfies Prisma.UserSelect;

/** Prisma's relation-filter shape for "does/doesn't have a PASSWORD credential yet" — see StaffStatus's own doc comment for why this, not a stored column, is the source of truth. */
function staffStatusWhere(status?: StaffSummary["status"]): Prisma.UserWhereInput {
  if (status === "DEACTIVATED") return { isActive: false };
  if (status === "ACTIVE") return { isActive: true, authCredentials: { some: { method: AuthMethod.PASSWORD } } };
  if (status === "INVITED") return { isActive: true, authCredentials: { none: { method: AuthMethod.PASSWORD } } };
  return {};
}

function toStaffSummary(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  authCredentials: { id: string }[];
}): StaffSummary {
  const hasCredential = row.authCredentials.length > 0;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as StaffSummary["role"],
    isActive: row.isActive,
    status: !row.isActive ? "DEACTIVATED" : hasCredential ? "ACTIVE" : "INVITED",
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

function toStaffInvitationRecord(row: {
  userId: string;
  invitedById: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}): StaffInvitationRecord {
  return {
    userId: row.userId,
    invitedById: row.invitedById,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attempts: row.attempts,
    resendCount: row.resendCount,
    lastSentAt: row.lastSentAt,
  };
}

function toEntity(user: {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: string;
  isActive: boolean;
}): UserEntity {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role as UserEntity["role"],
    isActive: user.isActive,
  };
}

function toRefreshTokenRecord(row: {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

function toPasswordResetRecord(row: {
  email: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}): PasswordResetRecord {
  return {
    email: row.email,
    userId: row.userId,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attempts: row.attempts,
    resendCount: row.resendCount,
    lastSentAt: row.lastSentAt,
  };
}

function toEmailVerificationRecord(row: {
  email: string;
  codeHash: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}): EmailVerificationRecord {
  return {
    email: row.email,
    codeHash: row.codeHash,
    name: row.name,
    phone: row.phone,
    passwordHash: row.passwordHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attempts: row.attempts,
    resendCount: row.resendCount,
    lastSentAt: row.lastSentAt,
  };
}
