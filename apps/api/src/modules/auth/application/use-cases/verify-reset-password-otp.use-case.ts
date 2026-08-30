import type { VerifyResetOtpInput } from "@woobe/validation";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { hasVerifyAttemptsLeft, isOtpConsumed, isOtpExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

/**
 * Step 2 of forgot-password: confirm the emailed code is correct so the UI
 * can move on to a dedicated "set a new password" screen. Deliberately does
 * NOT consume or delete the reset row — the same code is submitted again
 * with the new password in ResetPasswordUseCase, which is the only step
 * that actually mutates anything. Wrong guesses here still count against
 * MAX_VERIFY_ATTEMPTS (the shared lifetime cap), so this can't be used to
 * probe codes for free.
 *
 * Guard order mirrors VerifyRegistrationOtpUseCase / ResetPasswordUseCase
 * exactly, so all three OTP checks behave identically for the client.
 */
export class VerifyResetPasswordOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
  ) {}

  async execute({ email, code }: VerifyResetOtpInput): Promise<void> {
    const record = await this.authRepository.findPasswordResetByEmail(email);
    if (!record || isOtpConsumed(record)) {
      throw new OtpInvalidError();
    }
    if (isOtpExpired(record, new Date())) {
      throw new OtpExpiredError();
    }
    if (!hasVerifyAttemptsLeft(record)) {
      throw new OtpMaxAttemptsError();
    }

    if (this.otpCodeService.hash(code) !== record.codeHash) {
      await this.authRepository.incrementPasswordResetAttempts(email);
      throw record.attempts + 1 >= MAX_VERIFY_ATTEMPTS ? new OtpMaxAttemptsError() : new OtpInvalidError();
    }
  }
}
