import { NotFoundError } from "../../../../shared/errors";
import type { UserEntity } from "../../domain/entities/user.entity";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

export class GetCurrentUserUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(userId: string): Promise<UserEntity> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }
}
