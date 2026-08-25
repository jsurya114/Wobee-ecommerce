import type { RegisterInput } from "@woobe/validation";
import { ConflictError } from "../../../../shared/errors";
import type { UserEntity } from "../../domain/entities/user.entity";
import type { BcryptService } from "../../infrastructure/services/bcrypt.service";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import { issueTokenPair, type TokenPair } from "./issue-token-pair";

export interface RegisterResult extends TokenPair {
  user: UserEntity;
}

export class RegisterUserUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly bcryptService: BcryptService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    const existing = await this.authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await this.bcryptService.hash(input.password);
    const user = await this.authRepository.createUserWithPassword({
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash,
    });

    const tokens = await issueTokenPair(user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });

    return { user, ...tokens };
  }
}
