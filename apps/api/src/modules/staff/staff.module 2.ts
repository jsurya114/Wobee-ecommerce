// Composition root for the Staff Management System (2026-09-06, ADR-024's
// MANAGE_STAFF surface). Deliberately owns NO Prisma access of its own —
// every use-case here composes directly on auth's exported authRepository
// (same "sibling module imports auth's exports" shape `users` already uses,
// per admin.module.ts's own comment on GetCustomerDetailUseCase) rather than
// a second repository touching the User/AuthCredential tables auth already
// owns. StaffInvitation is the one table this feature adds, and it's
// accessed exclusively through that same AuthRepositoryPort — see
// auth-repository.port.ts's own "Staff Management System" section.
//
// The admin-permission-gated CRUD surface (/admin/staff/*) is wired in
// admin.module.ts, exactly like every other admin-* controller (ADR-025) —
// this module only owns the use-cases plus its own PUBLIC, pre-auth
// activation router (an invited staff member has no session yet, so those
// two routes can't live behind requirePermission(MANAGE_STAFF)).
import { env } from "../../config/env";
import { authRepository, bcryptService, otpCodeService } from "../auth/auth.module";
import { recordAuditLogUseCase } from "../audit/audit.module";
import { ActivateStaffUseCase } from "./application/use-cases/activate-staff.use-case";
import { ChangeStaffRoleUseCase } from "./application/use-cases/change-staff-role.use-case";
import { CreateStaffUseCase } from "./application/use-cases/create-staff.use-case";
import { GetStaffDetailUseCase } from "./application/use-cases/get-staff-detail.use-case";
import { ListStaffUseCase } from "./application/use-cases/list-staff.use-case";
import { ResendStaffInvitationUseCase } from "./application/use-cases/resend-staff-invitation.use-case";
import { SetStaffActiveUseCase } from "./application/use-cases/set-staff-active.use-case";
import { VerifyStaffInvitationUseCase } from "./application/use-cases/verify-staff-invitation.use-case";
import { DevStaffInvitationNotifier } from "./infrastructure/services/dev-staff-invitation-notifier";
import { SmtpStaffInvitationNotifier } from "./infrastructure/services/smtp-staff-invitation-notifier";
import { StaffActivationController } from "./interface/http/staff-activation.controller";
import { createStaffActivationRouter } from "./interface/http/staff-activation.routes";

// Same fallback rule every other notifier in this codebase follows: real
// SMTP once SMTP_HOST is configured, a dev stub (logs the code) otherwise.
const staffInvitationNotifier = env.SMTP_HOST ? new SmtpStaffInvitationNotifier() : new DevStaffInvitationNotifier();

/** Exported for admin.module.ts's AdminStaffController (ADR-025's "controllers live in admin, use-cases live in their owning module" shape). */
export const createStaffUseCase = new CreateStaffUseCase(authRepository, otpCodeService, staffInvitationNotifier, recordAuditLogUseCase);
export const listStaffUseCase = new ListStaffUseCase(authRepository);
export const getStaffDetailUseCase = new GetStaffDetailUseCase(authRepository);
export const changeStaffRoleUseCase = new ChangeStaffRoleUseCase(authRepository, recordAuditLogUseCase);
export const setStaffActiveUseCase = new SetStaffActiveUseCase(authRepository, recordAuditLogUseCase);
export const resendStaffInvitationUseCase = new ResendStaffInvitationUseCase(authRepository, otpCodeService, staffInvitationNotifier, recordAuditLogUseCase);

const verifyStaffInvitationUseCase = new VerifyStaffInvitationUseCase(authRepository, otpCodeService);
const activateStaffUseCase = new ActivateStaffUseCase(authRepository, otpCodeService, bcryptService, recordAuditLogUseCase);
const staffActivationController = new StaffActivationController(verifyStaffInvitationUseCase, activateStaffUseCase);

/** Public, pre-auth activation routes only — mounted at /api/v1/staff (see modules/index.ts). The permission-gated CRUD surface lives at /api/v1/admin/staff (admin.module.ts). */
export const router = createStaffActivationRouter(staffActivationController);
