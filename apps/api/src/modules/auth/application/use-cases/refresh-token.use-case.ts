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
 * forked). Every-session revocation is kept for real evidence of theft —
 * an old token replayed after its replacement was used; see
 * handleRevokedToken for the full rules. `reuseGraceSeconds = 0` disables
 * only the recovery window.
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

  /**
   * A revoked token was presented. Revoke EVERY session only on proof the
   * session continued past it — its replacement was itself rotated (someone
   * used it). Otherwise nobody has continued the chain, so this is a stale or
   * lost-response cookie, not theft:
   *  - revoked without rotation (logout / revoke-all / password reset) → 401;
   *  - rotated, replacement never used, inside the grace window → recover
   *    (the client never received the rotation response);
   *  - rotated, replacement never used, after the window → end just this
   *    session (retire the unused replacement) → 401. Nobody gains access and
   *    the user's other devices are untouched. Found 2026-09-29: a tab closed
   *    mid-refresh and reopened 23 minutes later revoked every session.
   * Rows rotated before replacedByTokenId existed (NULL) count as unrotated.
   */
  private async handleRevokedToken(record: RefreshTokenRecord): Promise<TokenPair> {
    if (record.replacedByTokenId === null) {
      throw new UnauthorizedError("Refresh token revoked");
    }

    const replacement = await this.authRepository.findRefreshTokenById(record.replacedByTokenId);

    if (replacement && !replacement.revokedAt) {
      const withinGrace =
        this.reuseGraceSeconds > 0 && record.revokedAt !== null && Date.now() - record.revokedAt.getTime() <= this.reuseGraceSeconds * 1000;
      // Claim the unused replacement atomically: exactly one concurrent retry wins.
      const claimed = await this.authRepository.revokeRefreshTokenIfActive(replacement.id);
      if (claimed && withinGrace) {
        const user = await this.loadActiveUser(record.userId);
        const pair = await this.issue(user);
        // The retired replacement and the original both point at the new token,
        // so presenting either later follows the same rules (and a replay after
        // the new token is used is caught as theft below).
        await this.authRepository.setRefreshTokenReplacement(replacement.id, pair.refreshTokenId);
        await this.authRepository.setRefreshTokenReplacement(record.id, pair.refreshTokenId);
        return pair;
      }
      if (claimed) {
        throw new UnauthorizedError("Session expired — please sign in again");
      }
      // Lost the claim to a concurrent request — re-read and decide again.
      const fresh = await this.authRepository.findRefreshTokenById(record.id);
      return fresh && fresh.replacedByTokenId !== record.replacedByTokenId
        ? this.handleRevokedToken(fresh)
        : Promise.reject(new UnauthorizedError("Refresh token revoked"));
    }

    if (!replacement || replacement.replacedByTokenId === null) {
      // The replacement ended without being used (logout, revoke-all, retired
      // after the grace window): stale, not theft.
      throw new UnauthorizedError("Refresh token revoked");
    }

    // The session continued past this token (its replacement was rotated), yet
    // this old token came back — the most likely explanation is theft. Treat it
    // as compromise: kill every session for this user.
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
