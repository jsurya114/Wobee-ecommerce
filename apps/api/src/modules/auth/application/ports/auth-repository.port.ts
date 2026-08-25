import type { UserEntity } from "../../domain/entities/user.entity";

export interface CreateUserInput {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
}

export interface UserWithPasswordHash {
  user: UserEntity;
  passwordHash: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface AuthRepositoryPort {
  findUserByEmail(email: string): Promise<UserEntity | null>;
  findUserById(id: string): Promise<UserEntity | null>;
  /** Includes the PASSWORD auth credential's hash (or null if the user has none — e.g. future OTP-only accounts) in one query. */
  findUserWithPasswordHashByEmail(email: string): Promise<UserWithPasswordHash | null>;
  createUserWithPassword(input: CreateUserInput): Promise<UserEntity>;

  /** tokenHash is the sha256 hex digest of the raw token — the raw token is never persisted (see RefreshToken model comment). */
  createRefreshToken(params: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  /** Reuse-detection response: a presented-but-already-revoked token means the token leaked — kill every session for that user. */
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
}
