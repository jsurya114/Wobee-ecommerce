import { AuthMethod, Prisma, prisma } from "@woobe/database";
import { ConflictError } from "../../../../shared/errors";
import type {
  AuthRepositoryPort,
  CreateUserInput,
  RefreshTokenRecord,
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
            create: { method: AuthMethod.PASSWORD, passwordHash: input.passwordHash },
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
  return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
}
