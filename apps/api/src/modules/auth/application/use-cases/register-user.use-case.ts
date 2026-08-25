import type { RegisterInput } from "@woobe/validation";
import type { UserEntity } from "../../domain/entities/user.entity";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

export class RegisterUserUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(_input: RegisterInput): Promise<UserEntity> {
    // TODO (Day 2): check email uniqueness, hash password (BcryptService),
    // create User + AuthCredential, return the entity. Token issuance is the
    // controller's job (calls LoginUserUseCase after registering), keeping
    // this use-case single-purpose.
    void this.authRepository;
    throw new Error("Not implemented — Week 1 Day 2");
  }
}
