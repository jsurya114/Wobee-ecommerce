import ms from "ms";
import { env } from "../../../../config/env";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { UserEntity } from "../../domain/entities/user.entity";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Shared by RegisterUserUseCase, LoginUserUseCase, and
 * RefreshTokenUseCase — the "issue a fresh session" step is identical in
 * all three, only what happens before it differs.
 */
export async function issueTokenPair(
  user: Pick<UserEntity, "id" | "role">,
  deps: { authRepository: AuthRepositoryPort; jwtService: JwtService; refreshTokenService: RefreshTokenService },
): Promise<TokenPair> {
  const accessToken = deps.jwtService.signAccessToken({ sub: user.id, role: user.role });

  const refreshToken = deps.refreshTokenService.generate();
  const refreshTokenExpiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_TOKEN_TTL));
  await deps.authRepository.createRefreshToken({
    userId: user.id,
    tokenHash: deps.refreshTokenService.hash(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}
