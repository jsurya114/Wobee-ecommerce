import type { ResendOtpInput } from "@woobe/validation";
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
import type { OtpNotifierPort } from "../ports/otp-notifier.port";
import { exposeDevCode } from "./otp-dev-code";
import type { RegistrationChallenge } from "./start-registration.use-case";

/**
 * "Resend code": regenerate the OTP for an existing pending registration,
 * behind a per-row cooldown and a resend cap. No pending row (or a consumed
 * one) → the visitor must start over.
 */
export class ResendRegistrationOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly otpNotifier: OtpNotifierPort,
  ) {}

  async execute({ email }: ResendOtpInput): Promise<RegistrationChallenge> {
    const record = await this.authRepository.findEmailVerificationByEmail(email);
    if (!record || isOtpConsumed(record)) {
      throw new OtpInvalidError();
    }
    // A resend can't buy back a pending registration that already burned
    // through its lifetime verify-attempt cap — that row is dead until it
    // expires, at which point `start` issues a genuinely fresh one.
    if (resendLimitReached(record) || !hasVerifyAttemptsLeft(record)) {
      throw new OtpMaxAttemptsError();
    }
    const now = new Date();
    const remainingMs = resendCooldownRemainingMs(record, now);
    if (remainingMs > 0) {
      throw new OtpResendCooldownError(Math.ceil(remainingMs / 1000));
    }

    // A resent code must not repeat the one it replaces. With a 4-digit
    // code a collision is 1-in-10,000; a handful of redraws makes it moot.
    let code = this.otpCodeService.generateNumericCode();
    for (let i = 0; i < 10 && this.otpCodeService.hash(code) === record.codeHash; i++) {
      code = this.otpCodeService.generateNumericCode();
    }
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await this.authRepository.refreshEmailVerification({
      email,
      codeHash: this.otpCodeService.hash(code),
      expiresAt,
      lastSentAt: now,
    });

    await this.otpNotifier.sendRegistrationOtp({ email, code, expiresAt });

    return {
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      devCode: exposeDevCode(code),
    };
  }
}
