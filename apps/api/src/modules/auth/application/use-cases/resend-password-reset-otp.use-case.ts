import type { ResendPasswordResetOtpInput } from "@woobe/validation";
import { OtpInvalidError, OtpMaxAttemptsError, OtpResendCooldownError } from "../../domain/errors/otp.errors";
import {
  hasVerifyAttemptsLeft,
  isOtpConsumed,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  resendLimitReached,
} from "../../domain/otp.policy";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { PasswordResetNotifierPort } from "../ports/password-reset-notifier.port";
import { exposeDevCode } from "./otp-dev-code";
import type { PasswordResetChallenge } from "./forgot-password.use-case";

/**
 * "Resend code" for an in-progress password reset — behind the same per-row
 * cooldown + resend cap as registration. No live row (or a consumed one) →
 * OtpInvalidError; the visitor must start `forgot` again. A burned
 * verify-attempt cap can't be bought back by a resend either.
 */
export class ResendPasswordResetOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly notifier: PasswordResetNotifierPort,
  ) {}

  async execute({ email }: ResendPasswordResetOtpInput): Promise<PasswordResetChallenge> {
    const record = await this.authRepository.findPasswordResetByEmail(email);
    if (!record || isOtpConsumed(record)) {
      throw new OtpInvalidError();
    }
    if (resendLimitReached(record) || !hasVerifyAttemptsLeft(record)) {
      throw new OtpMaxAttemptsError();
    }
    const now = new Date();
    const remainingMs = resendCooldownRemainingMs(record, now);
    if (remainingMs > 0) {
      throw new OtpResendCooldownError(Math.ceil(remainingMs / 1000));
    }

    let code = this.otpCodeService.generateNumericCode();
    for (let i = 0; i < 10 && this.otpCodeService.hash(code) === record.codeHash; i++) {
      code = this.otpCodeService.generateNumericCode();
    }
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await this.authRepository.refreshPasswordReset({
      email,
      codeHash: this.otpCodeService.hash(code),
      expiresAt,
      lastSentAt: now,
    });

    await this.notifier.sendPasswordResetOtp({ email, code, expiresAt });

    return {
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      devCode: exposeDevCode(code),
    };
  }
}
