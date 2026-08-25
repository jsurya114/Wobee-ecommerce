import type { LoginInput } from "@woobe/validation";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export class LoginUserUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(_input: LoginInput): Promise<LoginResult> {
    // TODO (Day 2): look up user, verify password hash (BcryptService,
    // constant-time compare), throw InvalidCredentialsError on mismatch,
    // sign access + refresh tokens (JwtService).
    void this.authRepository;
    throw new Error("Not implemented — Week 1 Day 2");
  }
}
