import type { RegisterStartInput } from "@woobe/validation";
import { ConflictError } from "../../../../shared/errors";
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
import type { BcryptService } from "../../infrastructure/services/bcrypt.service";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { OtpNotifierPort } from "../ports/otp-notifier.port";
import { exposeDevCode } from "./otp-dev-code";

export interface RegistrationChallenge {
  expiresAt: Date;
  resendAvailableAt: Date;
  /** Local convenience only — omitted in production and once real SMTP is configured (see exposeDevCode). */
  devCode?: string;
}

/**
 * Step 1 of email-OTP registration: no `users` row is created here. Rejects
 * an email that's already a real account (same message as the old
 * RegisterUserUseCase), bcrypt-hashes the password, and stashes the pending
 * registration + a sha256(code) on the `email_verifications` row.
 *
 * SECURITY: re-submitting `start` while a live (unexpired, unconsumed) pending
 * row exists is treated exactly like a "resend" — same cooldown, same resend
 * cap, and crucially the `attempts` counter is NOT reset (see otp.policy's
 * MAX_VERIFY_ATTEMPTS note). Only once the old code has expired or been
 * consumed does a genuinely fresh row (counters zeroed) get minted. Otherwise
 * a 4-digit code would be brute-forceable: burn attempts, re-`start`, repeat.
 */
export class StartRegistrationUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly bcryptService: BcryptService,
    private readonly otpCodeService: OtpCodeService,
    private readonly otpNotifier: OtpNotifierPort,
  ) {}

  async execute(input: RegisterStartInput): Promise<RegistrationChallenge> {
    const existing = await this.authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const now = new Date();
    const pending = await this.authRepository.findEmailVerificationByEmail(input.email);
    const hasLivePending = pending !== null && !isOtpConsumed(pending) && !isOtpExpired(pending, now);

    if (hasLivePending) {
      // Same guards a "resend" faces — a re-`start` must not be a cheaper path.
      if (resendLimitReached(pending) || !hasVerifyAttemptsLeft(pending)) {
        throw new OtpMaxAttemptsError();
      }
      const remainingMs = resendCooldownRemainingMs(pending, now);
      if (remainingMs > 0) {
        throw new OtpResendCooldownError(Math.ceil(remainingMs / 1000));
      }
    }

    const passwordHash = await this.bcryptService.hash(input.password);
    let code = this.otpCodeService.generateNumericCode();
    if (hasLivePending) {
      // A replacement code must not repeat the one it supersedes.
      for (let i = 0; i < 10 && this.otpCodeService.hash(code) === pending.codeHash; i++) {
        code = this.otpCodeService.generateNumericCode();
      }
    }
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    if (hasLivePending) {
      await this.authRepository.refreshEmailVerification({
        email: input.email,
        codeHash: this.otpCodeService.hash(code),
        expiresAt,
        lastSentAt: now,
        // The form may have changed between submissions; `attempts` stays put.
        name: input.name,
        phone: input.phone ?? null,
        passwordHash,
      });
    } else {
      await this.authRepository.upsertEmailVerification({
        email: input.email,
        codeHash: this.otpCodeService.hash(code),
        name: input.name,
        phone: input.phone,
        passwordHash,
        expiresAt,
        lastSentAt: now,
      });
    }

    await this.otpNotifier.sendRegistrationOtp({
      email: input.email,
      code,
      expiresAt,
    });

    return {
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      devCode: exposeDevCode(code),
    };
  }
}
