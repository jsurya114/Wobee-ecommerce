import type { ActivateStaffInput } from "@woobe/validation";
import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort } from "../../../auth/application/ports/auth-repository.port";
import type { BcryptService } from "../../../auth/infrastructure/services/bcrypt.service";
import type { OtpCodeService } from "../../../auth/infrastructure/services/otp-code.service";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import { hasVerifyAttemptsLeft, isInvitationConsumed, isInvitationExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/staff-invitation.policy";
import { StaffInvitationExpiredError, StaffInvitationInvalidError, StaffInvitationMaxAttemptsError } from "../../domain/errors/staff.errors";

/**
 * Public, pre-auth. Step 2 of activation — verifies the code and, if
 * correct, creates the staff member's PASSWORD credential (there is none
 * until this point; see StaffInvitation model's own doc comment on why
 * "no credential yet" IS the "invited" status, not a separate flag). No
 * session is issued — the staff member logs in fresh afterwards through the
 * normal admin login surface, exactly like ResetPasswordUseCase's own
 * "no session issued" rule for the customer forgot-password flow.
 */
export class ActivateStaffUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly bcryptService: BcryptService,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute({ email, code, password }: ActivateStaffInput): Promise<void> {
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

    const passwordHash = await this.bcryptService.hash(password);
    await this.authRepository.consumeStaffInvitationAndSetPassword({ userId: record.userId, passwordHash });

    const staff = await this.authRepository.findStaffSummaryById(record.userId);
    if (!staff) {
      throw new NotFoundError("Staff member not found");
    }
    await this.recordAuditLogUseCase.execute({
      actorId: staff.id, // the staff member accepting their own invitation is the actor for this event
      actorRole: staff.role,
      action: "STAFF_INVITATION_ACCEPTED",
      entityType: "User",
      entityId: staff.id,
    });
  }
}
