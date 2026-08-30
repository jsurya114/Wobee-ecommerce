import type { ResetPasswordInput } from "@woobe/validation";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { hasVerifyAttemptsLeft, isOtpConsumed, isOtpExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import type { BcryptService } from "../../infrastructure/services/bcrypt.service";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";

/**
 * Step 2 of forgot-password: check the code and, if it's right, set the new
 * password. Single call — the code and the new password arrive together, so
 * the code is consumed exactly once. On success every refresh token for the
 * user is revoked (a password change ends all other sessions) and the reset
 * row is deleted. No session is issued — the user logs in fresh afterwards.
 *
 * Deliberately mirrors VerifyRegistrationOtpUseCase's guard order (expired →
 * attempt cap → wrong code increments-then-throws) so the two OTP flows
 * behave identically from the client's side.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly bcryptService: BcryptService,
  ) {}

  async execute({ email, code, password }: ResetPasswordInput): Promise<void> {
    const record = await this.authRepository.findPasswordResetByEmail(email);
    // No reset in progress — don't reveal whether a `forgot` ever happened.
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

    const passwordHash = await this.bcryptService.hash(password);
    await this.authRepository.updateUserPassword(record.userId, passwordHash);
    await this.authRepository.deletePasswordReset(email);
    // A password change kills every existing session — same response as
    // refresh-token reuse detection.
    await this.authRepository.revokeAllRefreshTokensForUser(record.userId);
  }
}
