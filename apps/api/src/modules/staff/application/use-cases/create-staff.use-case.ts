import type { CreateStaffInput as CreateStaffRequest } from "@woobe/validation";
import type { Role } from "@woobe/types";
import type { AuthRepositoryPort, StaffSummary } from "../../../auth/application/ports/auth-repository.port";
import type { OtpCodeService } from "../../../auth/infrastructure/services/otp-code.service";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import { STAFF_INVITATION_TTL_MS } from "../../domain/staff-invitation.policy";
import type { StaffInvitationNotifierPort } from "../ports/staff-invitation-notifier.port";
import { exposeDevCode } from "./staff-dev-code";

export interface CreateStaffResult {
  staff: StaffSummary;
  invitationExpiresAt: Date;
  /** Local convenience only — see exposeDevCode's own doc comment. */
  devCode?: string;
}

/**
 * super_admin-only (MANAGE_STAFF, enforced at the route). Creates a staff
 * User row (role set, isActive true, NO AuthCredential yet) and its
 * StaffInvitation in one atomic write (AuthRepository.createStaffUser),
 * then emails the activation code — reusing OtpCodeService/the notifier
 * port exactly like every other OTP-gated flow in this codebase, not a new
 * credential system. Throws ConflictError (from the repository) on a
 * duplicate email; CUSTOMER/unsupported roles are already rejected by
 * createStaffSchema before this ever runs.
 */
export class CreateStaffUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly notifier: StaffInvitationNotifierPort,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute(actor: { id: string; role: Role }, input: CreateStaffRequest): Promise<CreateStaffResult> {
    const code = this.otpCodeService.generateNumericCode();
    const expiresAt = new Date(Date.now() + STAFF_INVITATION_TTL_MS);

    const staff = await this.authRepository.createStaffUser({
      email: input.email,
      name: input.name,
      role: input.role,
      invitedById: actor.id,
      codeHash: this.otpCodeService.hash(code),
      expiresAt,
    });

    await this.recordAuditLogUseCase.execute({
      actorId: actor.id,
      actorRole: actor.role,
      action: "STAFF_CREATED",
      entityType: "User",
      entityId: staff.id,
      metadata: { role: input.role },
    });

    await this.notifier.sendStaffInvitation({ email: input.email, name: input.name, code, expiresAt });

    await this.recordAuditLogUseCase.execute({
      actorId: actor.id,
      actorRole: actor.role,
      action: "STAFF_INVITATION_SENT",
      entityType: "User",
      entityId: staff.id,
    });

    return { staff, invitationExpiresAt: expiresAt, devCode: exposeDevCode(code) };
  }
}
