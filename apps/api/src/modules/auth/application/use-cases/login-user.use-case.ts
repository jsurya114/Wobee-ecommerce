import type { LoginInput } from "@woobe/validation";
import type { UserEntity } from "../../domain/entities/user.entity";
import { ForbiddenError } from "../../../../shared/errors";
import { InvalidCredentialsError } from "../../domain/errors/invalid-credentials.error";
import type { BcryptService } from "../../infrastructure/services/bcrypt.service";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import { issueTokenPair, type TokenPair } from "./issue-token-pair";

export interface LoginResult extends TokenPair {
  user: UserEntity;
}

export class LoginUserUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly bcryptService: BcryptService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const record = await this.authRepository.findUserWithPasswordHashByEmail(input.email);

    // Same error for "no such user" and "wrong password" — never reveal which
    // one it was (that's an account-enumeration leak).
    if (!record || !record.passwordHash) {
      // Still run a bcrypt compare against a dummy hash even when there's no
      // user, so this path takes roughly the same time as a real mismatch —
      // otherwise "user not found" responds measurably faster than "wrong
      // password" and becomes a timing side-channel for enumerating emails.
      await this.bcryptService.compare(input.password, DUMMY_HASH);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.bcryptService.compare(input.password, record.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    if (!record.user.isActive) {
      throw new ForbiddenError("This account has been deactivated");
    }

    const tokens = await issueTokenPair(record.user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });

    return { user: record.user, ...tokens };
  }
}

// A real bcrypt hash of an unguessable value — used only to equalize timing, never compared against real input.
const DUMMY_HASH = "$2a$12$0y9KvJwmQeduK/gXfIFyeucHwkaKXm6ZuZD9e6so4KUYsnToo/Lby";
