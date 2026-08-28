import type { UserEntity } from "../../domain/entities/user.entity";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

/**
 * Week 2 Day 3 (week2 (1).md §6 — Customer Profile). Only `name` is
 * editable here, deliberately: §6 also says "sensitive identity changes
 * must use the approved verification flow," and this codebase has no
 * approved email/phone verification flow (OTP is only "extensible for
 * later" per plan.md §3, nothing built) — accepting an email/phone change
 * through this endpoint would invent that flow rather than implement an
 * approved one. `packages/validation`'s `updateProfileSchema` enforces the
 * same restriction at the request-shape level, so this isn't just an
 * unenforced convention.
 *
 * Lives in `auth`, not the new `users` module, because `auth` already owns
 * every write to the `User` table (ADR-010) — `users.module.ts` imports
 * this use-case directly (same pattern `admin.module.ts` already uses for
 * `registerUserUseCase`/`loginUserUseCase`) rather than `users` growing its
 * own competing repository onto the same table.
 */
export class UpdateUserProfileUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(userId: string, name: string): Promise<UserEntity> {
    return this.authRepository.updateUserName(userId, name);
  }
}
