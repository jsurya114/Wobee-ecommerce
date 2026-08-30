import type { LoginInput, RegisterInput, RegisterStartInput, ResendOtpInput, VerifyOtpInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../../shared/errors";
import type { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case";
import type { LoginUserUseCase } from "../../application/use-cases/login-user.use-case";
import type { LogoutUserUseCase } from "../../application/use-cases/logout-user.use-case";
import type { RefreshTokenUseCase } from "../../application/use-cases/refresh-token.use-case";
import type { RegisterUserUseCase } from "../../application/use-cases/register-user.use-case";
import type { ResendRegistrationOtpUseCase } from "../../application/use-cases/resend-registration-otp.use-case";
import type { StartRegistrationUseCase } from "../../application/use-cases/start-registration.use-case";
import type { VerifyRegistrationOtpUseCase } from "../../application/use-cases/verify-registration-otp.use-case";
import { clearRefreshTokenCookie, REFRESH_TOKEN_COOKIE, setRefreshTokenCookie } from "./refresh-cookie";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUserUseCase: LoginUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUserUseCase: LogoutUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly startRegistrationUseCase: StartRegistrationUseCase,
    private readonly verifyRegistrationOtpUseCase: VerifyRegistrationOtpUseCase,
    private readonly resendRegistrationOtpUseCase: ResendRegistrationOtpUseCase,
  ) {}

  async register(req: Request, res: Response): Promise<void> {
    const input = req.body as RegisterInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await this.registerUserUseCase.execute(input);
    setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(201).json({ user: toPublicUser(user), accessToken });
  }

  /** Email-OTP registration, step 1 — no account created yet. */
  async startRegistration(req: Request, res: Response): Promise<void> {
    const input = req.body as RegisterStartInput;
    const { expiresAt, resendAvailableAt, devCode } = await this.startRegistrationUseCase.execute(input);
    res.status(200).json({
      pending: true,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      ...(devCode ? { devCode } : {}),
    });
  }

  /** Step 2 — verifies the code and finishes account creation (same response as `register`). */
  async verifyRegistrationOtp(req: Request, res: Response): Promise<void> {
    const input = req.body as VerifyOtpInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } =
      await this.verifyRegistrationOtpUseCase.execute(input);
    setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(201).json({ user: toPublicUser(user), accessToken });
  }

  async resendRegistrationOtp(req: Request, res: Response): Promise<void> {
    const input = req.body as ResendOtpInput;
    const { expiresAt, resendAvailableAt, devCode } = await this.resendRegistrationOtpUseCase.execute(input);
    res.status(200).json({
      pending: true,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      ...(devCode ? { devCode } : {}),
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const input = req.body as LoginInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await this.loginUserUseCase.execute(input);
    setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ user: toPublicUser(user), accessToken });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedError("No refresh token cookie");
    }
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.refreshTokenUseCase.execute(rawToken);
    setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ accessToken });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.logoutUserUseCase.execute(rawToken);
    clearRefreshTokenCookie(res);
    res.status(204).send();
  }

  async me(req: Request, res: Response): Promise<void> {
    // req.user is guaranteed by authGuard (mounted before this handler in auth.routes.ts).
    const user = await this.getCurrentUserUseCase.execute(req.user!.id);
    res.status(200).json({ user: toPublicUser(user) });
  }
}

function toPublicUser(user: { id: string; email: string; name: string; role: string; phone: string | null }) {
  // Deliberately not spreading `user` — an explicit allowlist so a future
  // field (e.g. an internal flag) doesn't leak to the client by accident.
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
  };
}
