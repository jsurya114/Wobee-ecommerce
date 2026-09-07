import type { VerifyStaffInvitationInput } from "@woobe/validation";
import type { AuthRepositoryPort } from "../../../auth/application/ports/auth-repository.port";
import type { OtpCodeService } from "../../../auth/infrastructure/services/otp-code.service";
import { hasVerifyAttemptsLeft, isInvitationConsumed, isInvitationExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/staff-invitation.policy";
import { StaffInvitationExpiredError, StaffInvitationInvalidError, StaffInvitationMaxAttemptsError } from "../../domain/errors/staff.errors";

/**
 * Public, pre-auth — the invited staff member isn't logged in yet. Step 1 of
 * activation: confirm the emailed code is correct so the UI can move on to a
 * "set your password" screen. Deliberately does NOT consume the code — the
 * same code is submitted again with the new password in ActivateStaffUseCase,
 * mirroring VerifyResetPasswordOtpUseCase's own two-step shape exactly. Wrong
 * guesses here still count against MAX_VERIFY_ATTEMPTS.
 */
export class VerifyStaffInvitationUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
  ) {}

  async execute({ email, code }: VerifyStaffInvitationInput): Promise<void> {
    const record = await this.authRepository.findStaffInvitationByEmail(email);
    if (!record || isInvitationConsumed(record)) {
      throw new StaffInvitationInvalidError();
    }
    if (isInvitationExpired(record, new Date())) {
      throw new StaffInvitationExpiredError();
    }
    if (!hasVerifyAttemptsLeft(record)) {
      throw new StaffInvitationMaxAttemptsError();
    }
    if (this.otpCodeService.hash(code) !== record.codeHash) {
      await this.authRepository.incrementStaffInvitationAttempts(record.userId);
      throw record.attempts + 1 >= MAX_VERIFY_ATTEMPTS ? new StaffInvitationMaxAttemptsError() : new StaffInvitationInvalidError();
    }
  }
}
