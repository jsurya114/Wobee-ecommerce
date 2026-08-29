import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

export class LogoutUserUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async execute(rawRefreshToken: string | undefined): Promise<void> {
    // Idempotent by design: no cookie, or a token that doesn't match any row
    // (already logged out elsewhere, expired, whatever) — logout still
    // "succeeds" from the caller's point of view, because the end state
    // (no valid session) is the same either way.
    if (!rawRefreshToken) return;

    const tokenHash = this.refreshTokenService.hash(rawRefreshToken);
    const record = await this.authRepository.findRefreshTokenByHash(tokenHash);
    if (!record) return;

    await this.authRepository.revokeRefreshToken(record.id);
  }
}
