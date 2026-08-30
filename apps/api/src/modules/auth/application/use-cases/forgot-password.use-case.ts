import type { ForgotPasswordInput } from "@woobe/validation";
import { OtpMaxAttemptsError, OtpResendCooldownError } from "../../domain/errors/otp.errors";
import {
  hasVerifyAttemptsLeft,
  isOtpConsumed,
  isOtpExpired,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  resendLimitReached,
} from "../../domain/otp.policy";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { PasswordResetNotifierPort } from "../ports/password-reset-notifier.port";
import { exposeDevCode } from "./otp-dev-code";

export interface PasswordResetChallenge {
  expiresAt: Date;
  resendAvailableAt: Date;
  /** Local convenience only — omitted in production and once real SMTP is configured (see exposeDevCode). Never present for an email that has no account. */
  devCode?: string;
}

/**
 * Step 1 of forgot-password: mint an email-OTP for an existing account.
 *
 * SECURITY — no account enumeration: an email with no account gets the SAME
 * response shape (a plausible challenge with no `devCode`) and nothing is
 * persisted or sent. Callers can't tell "sent" from "no such account".
 *
 * SECURITY — 4-digit code is only safe because `MAX_VERIFY_ATTEMPTS` is a
 * HARD LIFETIME cap on the reset row: re-submitting `forgot` while a live
 * (unexpired, unconsumed) row exists is treated exactly like a "resend" —
 * same cooldown, same resend cap, and `attempts` is NOT reset. Only once
 * the old code has expired or been consumed is a genuinely fresh row
 * (counters zeroed) minted. Same rule as StartRegistrationUseCase.
 */
export class ForgotPasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly notifier: PasswordResetNotifierPort,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<PasswordResetChallenge> {
    const now = new Date();
    const user = await this.authRepository.findUserByEmail(input.email);

    if (!user) {
      // No account — reveal nothing. Return a challenge that looks exactly
      // like a real one so a client can't distinguish the two cases.
      return {
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      };
    }

    const existing = await this.authRepository.findPasswordResetByEmail(input.email);
    const hasLive = existing !== null && !isOtpConsumed(existing) && !isOtpExpired(existing, now);

    if (hasLive) {
      // Same guards a "resend" faces — a re-`forgot` must not be a cheaper path.
      if (resendLimitReached(existing) || !hasVerifyAttemptsLeft(existing)) {
        throw new OtpMaxAttemptsError();
      }
      const remainingMs = resendCooldownRemainingMs(existing, now);
      if (remainingMs > 0) {
        throw new OtpResendCooldownError(Math.ceil(remainingMs / 1000));
      }
    }

    let code = this.otpCodeService.generateNumericCode();
    if (hasLive) {
      // A replacement code must not repeat the one it supersedes.
      for (let i = 0; i < 10 && this.otpCodeService.hash(code) === existing.codeHash; i++) {
        code = this.otpCodeService.generateNumericCode();
      }
    }
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    if (hasLive) {
      await this.authRepository.refreshPasswordReset({
        email: input.email,
        codeHash: this.otpCodeService.hash(code),
        expiresAt,
        lastSentAt: now,
      });
    } else {
      await this.authRepository.upsertPasswordReset({
        email: input.email,
        userId: user.id,
        codeHash: this.otpCodeService.hash(code),
        expiresAt,
        lastSentAt: now,
      });
    }

    await this.notifier.sendPasswordResetOtp({ email: input.email, code, expiresAt });

    return {
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      devCode: exposeDevCode(code),
    };
  }
}
