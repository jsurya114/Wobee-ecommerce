import { UnauthorizedError } from "../../../../shared/errors";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import { issueTokenPair, type TokenPair } from "./issue-token-pair";

export class RefreshTokenUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async execute(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.refreshTokenService.hash(rawRefreshToken);
    const record = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!record) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (record.revokedAt) {
      // Reuse of an already-rotated-out token — the most likely explanation is
      // theft (someone replayed an old cookie). Treat it as compromise: kill
      // every session for this user, forcing a fresh login everywhere.
      await this.authRepository.revokeAllRefreshTokensForUser(record.userId);
      throw new UnauthorizedError("Refresh token reuse detected — all sessions revoked");
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const user = await this.authRepository.findUserById(record.userId);
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }
    if (!user.isActive) {
      // Deactivated after the token was issued — don't let refresh keep the session alive.
      await this.authRepository.revokeAllRefreshTokensForUser(user.id);
      throw new UnauthorizedError("Account is deactivated");
    }

    // Rotation: this token is single-use. Revoke it, then issue a new pair.
    await this.authRepository.revokeRefreshToken(record.id);

    return issueTokenPair(user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });
  }
}
