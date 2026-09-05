// Composition root for the auth module — wires repos/services to use-cases
// to routes (ARCHITECTURE.md §3.2). This is the one place that constructs
// concrete infrastructure and hands it to the application layer as its
// port interfaces.
import { AuthenticateWithGoogleUseCase } from "./application/use-cases/authenticate-with-google.use-case";
import { ForgotPasswordUseCase } from "./application/use-cases/forgot-password.use-case";
import { GetCurrentUserUseCase } from "./application/use-cases/get-current-user.use-case";
import { GetCustomerForAdminUseCase } from "./application/use-cases/get-customer-for-admin.use-case";
import { ListCustomersAdminUseCase } from "./application/use-cases/list-customers-admin.use-case";
import { LinkGoogleAccountUseCase } from "./application/use-cases/link-google-account.use-case";
import { LoginUserUseCase } from "./application/use-cases/login-user.use-case";
import { LogoutUserUseCase } from "./application/use-cases/logout-user.use-case";
import { RefreshTokenUseCase } from "./application/use-cases/refresh-token.use-case";
import { RegisterUserUseCase } from "./application/use-cases/register-user.use-case";
import { ResendPasswordResetOtpUseCase } from "./application/use-cases/resend-password-reset-otp.use-case";
import { ResendRegistrationOtpUseCase } from "./application/use-cases/resend-registration-otp.use-case";
import { ResetPasswordUseCase } from "./application/use-cases/reset-password.use-case";
import { SetCustomerActiveUseCase } from "./application/use-cases/set-customer-active.use-case";
import { StartRegistrationUseCase } from "./application/use-cases/start-registration.use-case";
import { UpdateUserProfileUseCase } from "./application/use-cases/update-user-profile.use-case";
import { VerifyRegistrationOtpUseCase } from "./application/use-cases/verify-registration-otp.use-case";
import { VerifyResetPasswordOtpUseCase } from "./application/use-cases/verify-reset-password-otp.use-case";
import { env } from "../../config/env";
import { AuthRepository } from "./infrastructure/repositories/auth.repository";
import { BcryptService } from "./infrastructure/services/bcrypt.service";
import { DevOtpNotifier } from "./infrastructure/services/dev-otp-notifier";
import { DevPasswordResetNotifier } from "./infrastructure/services/dev-password-reset-notifier";
import { GoogleIdTokenVerifierService } from "./infrastructure/services/google-id-token-verifier.service";
import { JwtService } from "./infrastructure/services/jwt.service";
import { NotConfiguredGoogleVerifier } from "./infrastructure/services/not-configured-google-verifier";
import { OtpCodeService } from "./infrastructure/services/otp-code.service";
import { RefreshTokenService } from "./infrastructure/services/refresh-token.service";
import { SmtpOtpNotifier } from "./infrastructure/services/smtp-otp-notifier";
import { SmtpPasswordResetNotifier } from "./infrastructure/services/smtp-password-reset-notifier";
import { AuthController } from "./interface/http/auth.controller";
import { createAuthRouter } from "./interface/http/auth.routes";

const authRepository = new AuthRepository();
const bcryptService = new BcryptService();
const jwtService = new JwtService();
const refreshTokenService = new RefreshTokenService();
const otpCodeService = new OtpCodeService();
// Real email when SMTP is configured, otherwise the dev stub (logs the code;
// the API also returns it as `devCode` in non-prod). Both implement the same
// OtpNotifierPort — see DECISIONS_PENDING.md #7.
const otpNotifier = env.SMTP_HOST ? new SmtpOtpNotifier() : new DevOtpNotifier();
const passwordResetNotifier = env.SMTP_HOST ? new SmtpPasswordResetNotifier() : new DevPasswordResetNotifier();

/** Exported for cross-module use — the admin module (ADR-025) reuses these directly for staff login, same pattern as orders/payments' own exports. */
export const registerUserUseCase = new RegisterUserUseCase(
  authRepository,
  bcryptService,
  jwtService,
  refreshTokenService,
);
export const loginUserUseCase = new LoginUserUseCase(authRepository, bcryptService, jwtService, refreshTokenService);
export const refreshTokenUseCase = new RefreshTokenUseCase(authRepository, jwtService, refreshTokenService);
export const logoutUserUseCase = new LogoutUserUseCase(authRepository, refreshTokenService);
export const getCurrentUserUseCase = new GetCurrentUserUseCase(authRepository);
/** Exported for the `users` module's profile-edit endpoint (Week 2 Day 3) — see the use-case's own doc comment for why this lives in auth, not users. */
export const updateUserProfileUseCase = new UpdateUserProfileUseCase(authRepository);
/** Exported for `admin`'s HTTP layer (ADR-025) — Week 2 Day 7 admin customer management (week2 (1).md §19). */
export const listCustomersAdminUseCase = new ListCustomersAdminUseCase(authRepository);
export const getCustomerForAdminUseCase = new GetCustomerForAdminUseCase(authRepository);
export const setCustomerActiveUseCase = new SetCustomerActiveUseCase(authRepository);

export const startRegistrationUseCase = new StartRegistrationUseCase(
  authRepository,
  bcryptService,
  otpCodeService,
  otpNotifier,
);
export const verifyRegistrationOtpUseCase = new VerifyRegistrationOtpUseCase(
  authRepository,
  otpCodeService,
  jwtService,
  refreshTokenService,
);
export const resendRegistrationOtpUseCase = new ResendRegistrationOtpUseCase(
  authRepository,
  otpCodeService,
  otpNotifier,
);

export const forgotPasswordUseCase = new ForgotPasswordUseCase(authRepository, otpCodeService, passwordResetNotifier);
export const verifyResetPasswordOtpUseCase = new VerifyResetPasswordOtpUseCase(authRepository, otpCodeService);
export const resetPasswordUseCase = new ResetPasswordUseCase(authRepository, otpCodeService, bcryptService);
export const resendPasswordResetOtpUseCase = new ResendPasswordResetOtpUseCase(
  authRepository,
  otpCodeService,
  passwordResetNotifier,
);

// "Continue with Google" (2026-09-05) — real verification when
// GOOGLE_CLIENT_ID is configured, otherwise a verifier that fails the route
// safely (503) instead of skipping verification or crashing boot. See
// NotConfiguredGoogleVerifier's own doc comment.
const googleIdTokenVerifier = env.GOOGLE_CLIENT_ID
  ? new GoogleIdTokenVerifierService(env.GOOGLE_CLIENT_ID)
  : new NotConfiguredGoogleVerifier();

export const authenticateWithGoogleUseCase = new AuthenticateWithGoogleUseCase(
  authRepository,
  googleIdTokenVerifier,
  jwtService,
  refreshTokenService,
);
export const linkGoogleAccountUseCase = new LinkGoogleAccountUseCase(authRepository, googleIdTokenVerifier);

const authController = new AuthController(
  registerUserUseCase,
  loginUserUseCase,
  refreshTokenUseCase,
  logoutUserUseCase,
  getCurrentUserUseCase,
  startRegistrationUseCase,
  verifyRegistrationOtpUseCase,
  resendRegistrationOtpUseCase,
  forgotPasswordUseCase,
  verifyResetPasswordOtpUseCase,
  resetPasswordUseCase,
  resendPasswordResetOtpUseCase,
  authenticateWithGoogleUseCase,
  linkGoogleAccountUseCase,
);

export const router = createAuthRouter(authController);
