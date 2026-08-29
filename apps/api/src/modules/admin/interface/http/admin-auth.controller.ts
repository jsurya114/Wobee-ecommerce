import type { LoginInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../../shared/errors";
import type { GetCurrentUserUseCase } from "../../../auth/application/use-cases/get-current-user.use-case";
import type { LoginUserUseCase } from "../../../auth/application/use-cases/login-user.use-case";
import type { LogoutUserUseCase } from "../../../auth/application/use-cases/logout-user.use-case";
import type { RefreshTokenUseCase } from "../../../auth/application/use-cases/refresh-token.use-case";
import { ADMIN_REFRESH_TOKEN_COOKIE, clearAdminRefreshTokenCookie, setAdminRefreshTokenCookie } from "./admin-refresh-cookie";

/**
 * Staff-only login surface (ADR-025) — reuses auth's already role-agnostic
 * use-cases directly (same direct-import-of-a-sibling's-exported-use-case
 * style this codebase already uses throughout), but issues a SEPARATE
 * cookie (admin-refresh-cookie.ts) and rejects a CUSTOMER role outright
 * rather than ever handing a customer an admin session.
 */
export class AdminAuthController {
  constructor(
    private readonly loginUserUseCase: LoginUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUserUseCase: LogoutUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async login(req: Request, res: Response): Promise<void> {
    const input = req.body as LoginInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await this.loginUserUseCase.execute(input);

    if (user.role === "CUSTOMER") {
      // Invalidate the refresh token this login already minted rather than
      // leaving an unused-but-valid one sitting in the DB.
      await this.logoutUserUseCase.execute(refreshToken);
      throw new ForbiddenError("Not a staff account");
    }

    setAdminRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ user: toPublicUser(user), accessToken });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[ADMIN_REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedError("No admin refresh token cookie");
    }
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.refreshTokenUseCase.execute(rawToken);
    setAdminRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ accessToken });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[ADMIN_REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.logoutUserUseCase.execute(rawToken);
    clearAdminRefreshTokenCookie(res);
    res.status(204).send();
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await this.getCurrentUserUseCase.execute(req.user!.id);
    res.status(200).json({ user: toPublicUser(user) });
  }
}

function toPublicUser(user: { id: string; email: string; name: string; role: string; phone: string | null }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone };
}
