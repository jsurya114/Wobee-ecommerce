import type {
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  RegisterStartInput,
  ResendOtpInput,
  ResendPasswordResetOtpInput,
  ResetPasswordInput,
  VerifyOtpInput,
  VerifyResetOtpInput,
} from "@woobe/validation";
import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../../shared/errors";
import type { AuthenticateWithGoogleUseCase } from "../../application/use-cases/authenticate-with-google.use-case";
import type { ForgotPasswordUseCase } from "../../application/use-cases/forgot-password.use-case";
import type { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case";
import type { LinkGoogleAccountUseCase } from "../../application/use-cases/link-google-account.use-case";
import type { LoginUserUseCase } from "../../application/use-cases/login-user.use-case";
import type { LogoutUserUseCase } from "../../application/use-cases/logout-user.use-case";
import type { RefreshTokenUseCase } from "../../application/use-cases/refresh-token.use-case";
import type { RegisterUserUseCase } from "../../application/use-cases/register-user.use-case";
import type { ResendPasswordResetOtpUseCase } from "../../application/use-cases/resend-password-reset-otp.use-case";
import type { ResendRegistrationOtpUseCase } from "../../application/use-cases/resend-registration-otp.use-case";
import type { ResetPasswordUseCase } from "../../application/use-cases/reset-password.use-case";
import type { StartRegistrationUseCase } from "../../application/use-cases/start-registration.use-case";
import type { VerifyRegistrationOtpUseCase } from "../../application/use-cases/verify-registration-otp.use-case";
import type { VerifyResetPasswordOtpUseCase } from "../../application/use-cases/verify-reset-password-otp.use-case";
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
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly verifyResetPasswordOtpUseCase: VerifyResetPasswordOtpUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly resendPasswordResetOtpUseCase: ResendPasswordResetOtpUseCase,
    private readonly authenticateWithGoogleUseCase: AuthenticateWithGoogleUseCase,
    private readonly linkGoogleAccountUseCase: LinkGoogleAccountUseCase,
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

  /**
   * Forgot-password, step 1 — emails a reset code. Always 200 with the same
   * body shape whether or not the email has an account (no enumeration).
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const input = req.body as ForgotPasswordInput;
    const { expiresAt, resendAvailableAt, devCode } = await this.forgotPasswordUseCase.execute(input);
    res.status(200).json({
      pending: true,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      ...(devCode ? { devCode } : {}),
    });
  }

  /** Step 2 — confirms the code is correct so the client can show the "new password" screen. Doesn't consume the code. 204 on success, 422 otherwise. */
  async verifyResetPasswordOtp(req: Request, res: Response): Promise<void> {
    const input = req.body as VerifyResetOtpInput;
    await this.verifyResetPasswordOtpUseCase.execute(input);
    res.status(204).send();
  }

  /** Step 3 — verifies the code and sets the new password. 204; the user logs in fresh afterwards. */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const input = req.body as ResetPasswordInput;
    await this.resetPasswordUseCase.execute(input);
    res.status(204).send();
  }

  async resendPasswordResetOtp(req: Request, res: Response): Promise<void> {
    const input = req.body as ResendPasswordResetOtpInput;
    const { expiresAt, resendAvailableAt, devCode } = await this.resendPasswordResetOtpUseCase.execute(input);
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

  /** "Continue with Google" — logs in an existing linked account or creates a new one; verifies server-side (never trusts client-supplied profile data). Same response shape as login/register, plus isNewUser so the frontend can vary its toast copy. */
  async authenticateWithGoogle(req: Request, res: Response): Promise<void> {
    const input = req.body as GoogleAuthInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt, isNewUser } =
      await this.authenticateWithGoogleUseCase.execute(input.credential);
    setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(isNewUser ? 201 : 200).json({ user: toPublicUser(user), accessToken, isNewUser });
  }

  /** Authenticated account-linking — see LinkGoogleAccountUseCase's own doc comment. */
  async linkGoogleAccount(req: Request, res: Response): Promise<void> {
    const input = req.body as GoogleAuthInput;
    await this.linkGoogleAccountUseCase.execute(req.user!.id, input.credential);
    res.status(204).send();
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
