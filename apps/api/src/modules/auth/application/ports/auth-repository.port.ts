import type { UserEntity } from "../../domain/entities/user.entity";

export interface CreateUserInput {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface AuthRepositoryPort {
  findUserByEmail(email: string): Promise<UserEntity | null>;
  createUserWithPassword(input: CreateUserInput): Promise<UserEntity>;
  // TODO (Day 2): refresh-token storage/rotation methods once that flow is built.
}
