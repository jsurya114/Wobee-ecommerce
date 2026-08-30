import { AuthMethod, Prisma, prisma, Role } from "@woobe/database";
import { ConflictError } from "../../../../shared/errors";
import type {
  AuthRepositoryPort,
  CreateUserInput,
  CustomerSummary,
  EmailVerificationRecord,
  ListCustomersFilter,
  ListCustomersResult,
  RefreshEmailVerificationInput,
  RefreshTokenRecord,
  UpsertEmailVerificationInput,
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

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
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

  async findCustomersForAdmin(filter: ListCustomersFilter): Promise<ListCustomersResult> {
    const where: Prisma.UserWhereInput = {
      role: Role.CUSTOMER,
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
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

  async setUserActive(id: string, isActive: boolean): Promise<CustomerSummary> {
    return prisma.user.update({
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
