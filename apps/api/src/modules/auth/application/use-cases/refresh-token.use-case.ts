import { UnauthorizedError } from "../../../../shared/errors";
import type { UserEntity } from "../../domain/entities/user.entity";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort, RefreshTokenRecord } from "../ports/auth-repository.port";
import { issueTokenPair, type TokenPair } from "./issue-token-pair";

/**
 * Refresh-token rotation with reuse detection.
 *
 * Every refresh token is single-use: a successful refresh revokes it and
 * records which token replaced it. Presenting a revoked token is normally
 * treated as theft — every session for the user is revoked.
 *
 * One exception (2026-09-29, found investigating the "admin logged out after
 * a few minutes" bug, reproduced by aborting a refresh in flight): a client
 * that never RECEIVED its rotation response (tab closed or reloaded
 * mid-refresh, dropped mobile connection, proxy timeout) still holds the old
 * token and would otherwise trigger the theft path on its next refresh. So a
 * rotated token presented again within `reuseGraceSeconds` of its rotation,
 * while its replacement has never been used, is treated as that lost
 * response: the unused replacement is retired and a fresh pair issued. At
 * most one valid token per session exists at any time (the chain is never
 * forked), and a replay outside that narrow case — after the window, or
 * after the replacement was used — is still theft. A token that was revoked
 * WITHOUT rotation (logout / revoke-all) is rejected but does not trigger the
 * theft path. `reuseGraceSeconds = 0` disables only the grace window.
 */
export class RefreshTokenUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly reuseGraceSeconds: number = 0,
  ) {}

  async execute(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.refreshTokenService.hash(rawRefreshToken);
    const record = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!record) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (record.revokedAt) {
      return this.handleRevokedToken(record);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const user = await this.loadActiveUser(record.userId);

    // Rotation: issue the new pair, then revoke this token ONLY if it is still
    // active (atomic). If a concurrent request rotated it first, this one must
    // not also succeed — drop the pair just minted and treat the presentation
    // like any other reuse of a revoked token.
    const pair = await this.issue(user);
    const rotated = await this.authRepository.rotateRefreshToken(record.id, pair.refreshTokenId);
    if (!rotated) {
      await this.authRepository.revokeRefreshTokenIfActive(pair.refreshTokenId);
      const current = await this.authRepository.findRefreshTokenById(record.id);
      return this.handleRevokedToken(current ?? record);
    }
    return pair;
  }

  private async handleRevokedToken(record: RefreshTokenRecord): Promise<TokenPair> {
    const withinGrace =
      this.reuseGraceSeconds > 0 &&
      record.replacedByTokenId !== null &&
      record.revokedAt !== null &&
      Date.now() - record.revokedAt.getTime() <= this.reuseGraceSeconds * 1000;

    if (withinGrace) {
      const replacement = await this.authRepository.findRefreshTokenById(record.replacedByTokenId!);
      // Claim the unused replacement atomically — if it was already used (or
      // claimed by a concurrent retry), this presentation is not a lost
      // response and falls through to the theft path below.
      if (replacement && !replacement.revokedAt && (await this.authRepository.revokeRefreshTokenIfActive(replacement.id))) {
        const user = await this.loadActiveUser(record.userId);
        const pair = await this.issue(user);
        // Keep the original pointing at the newest replacement so a second
        // lost response inside the same window is recovered the same way.
        await this.authRepository.setRefreshTokenReplacement(record.id, pair.refreshTokenId);
        return pair;
      }
    }

    // A token that died WITHOUT being rotated (logout, a previous revoke-all,
    // password reset, deactivation) is just a stale cookie — e.g. another
    // device waking up after the user signed in again elsewhere. That is not
    // evidence of theft, and revoking everything here would sign the user out
    // of the session they just created (2026-09-29, reproduced in
    // auth.integration.test.ts "stale, already-dead cookie"). Reject it only.
    // Rows rotated before the replacedByTokenId column existed also land here.
    if (record.replacedByTokenId === null) {
      throw new UnauthorizedError("Refresh token revoked");
    }

    // Reuse of an already-rotated-out token — the most likely explanation is
    // theft (someone replayed an old cookie). Treat it as compromise: kill
    // every session for this user, forcing a fresh login everywhere.
    await this.authRepository.revokeAllRefreshTokensForUser(record.userId);
    throw new UnauthorizedError("Refresh token reuse detected — all sessions revoked");
  }

  private async loadActiveUser(userId: string): Promise<UserEntity> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }
    if (!user.isActive) {
      // Deactivated after the token was issued — don't let refresh keep the session alive.
      await this.authRepository.revokeAllRefreshTokensForUser(user.id);
      throw new UnauthorizedError("Account is deactivated");
    }
    return user;
  }

  private issue(user: UserEntity): Promise<TokenPair> {
    return issueTokenPair(user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });
  }
}
