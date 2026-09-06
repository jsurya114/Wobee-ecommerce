import type { Role } from "@woobe/types";
import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort } from "../../../auth/application/ports/auth-repository.port";
import type { OtpCodeService } from "../../../auth/infrastructure/services/otp-code.service";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import {
  hasVerifyAttemptsLeft,
  isInvitationConsumed,
  resendCooldownRemainingMs,
  resendLimitReached,
  STAFF_INVITATION_TTL_MS,
} from "../../domain/staff-invitation.policy";
import { StaffAlreadyActivatedError, StaffInvitationMaxAttemptsError, StaffInvitationResendCooldownError } from "../../domain/errors/staff.errors";
import type { StaffInvitationNotifierPort } from "../ports/staff-invitation-notifier.port";
import { exposeDevCode } from "./staff-dev-code";

export interface ResendStaffInvitationResult {
  expiresAt: Date;
  devCode?: string;
}

/** super_admin-only (MANAGE_STAFF). Only valid while the target hasn't completed activation yet — §22 of the staff-system spec ("Only offer Resend Invitation when the staff account has not completed activation"). */
export class ResendStaffInvitationUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly notifier: StaffInvitationNotifierPort,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute(actor: { id: string; role: Role }, targetId: string): Promise<ResendStaffInvitationResult> {
    const target = await this.authRepository.findStaffSummaryById(targetId);
    if (!target) {
      throw new NotFoundError("Staff member not found");
    }
    if (target.status !== "INVITED") {
      throw new StaffAlreadyActivatedError();
    }

    const record = await this.authRepository.findStaffInvitationByUserId(targetId);
    if (!record || isInvitationConsumed(record)) {
      throw new StaffAlreadyActivatedError();
    }
    if (resendLimitReached(record) || !hasVerifyAttemptsLeft(record)) {
      throw new StaffInvitationMaxAttemptsError();
    }
    const now = new Date();
    const remainingMs = resendCooldownRemainingMs(record, now);
    if (remainingMs > 0) {
      throw new StaffInvitationResendCooldownError(Math.ceil(remainingMs / 1000));
    }

    let code = this.otpCodeService.generateNumericCode();
    // A replacement code must not repeat the one it supersedes.
    for (let i = 0; i < 10 && this.otpCodeService.hash(code) === record.codeHash; i++) {
      code = this.otpCodeService.generateNumericCode();
    }
    const expiresAt = new Date(now.getTime() + STAFF_INVITATION_TTL_MS);

    await this.authRepository.refreshStaffInvitation({
      userId: targetId,
      codeHash: this.otpCodeService.hash(code),
      expiresAt,
      lastSentAt: now,
    });
    await this.notifier.sendStaffInvitation({ email: target.email, name: target.name, code, expiresAt });
    await this.recordAuditLogUseCase.execute({
      actorId: actor.id,
      actorRole: actor.role,
      action: "STAFF_INVITATION_RESENT",
      entityType: "User",
      entityId: targetId,
    });

    return { expiresAt, devCode: exposeDevCode(code) };
  }
}
