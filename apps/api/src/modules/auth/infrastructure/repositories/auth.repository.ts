import { prisma } from "@woobe/database";
import type { CreateUserInput, AuthRepositoryPort } from "../../application/ports/auth-repository.port";
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

  async createUserWithPassword(_input: CreateUserInput): Promise<UserEntity> {
    // TODO (Day 2): prisma.user.create({ data: { email, name, phone,
    // authCredentials: { create: { method: 'PASSWORD', passwordHash } } } })
    throw new Error("Not implemented — Week 1 Day 2");
  }
}

function toEntity(user: { id: string; email: string; phone: string | null; name: string; role: string }): UserEntity {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role as UserEntity["role"],
  };
}
