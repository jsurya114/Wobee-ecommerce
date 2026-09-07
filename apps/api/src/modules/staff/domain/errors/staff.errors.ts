import { ConflictError, ForbiddenError, UnprocessableEntityError } from "../../../../shared/errors";

// ── Invitation/activation — same "well-formed request, can't be honoured
// yet" shape as auth's OTP errors (422), duplicated rather than imported
// cross-module for the same reason as staff-invitation.policy.ts. ──

export class StaffInvitationInvalidError extends UnprocessableEntityError {
  constructor() {
    super("That code is incorrect. Check it and try again.");
  }
}

export class StaffInvitationExpiredError extends UnprocessableEntityError {
  constructor() {
    super("This invitation has expired. Ask a super admin to resend it.");
  }
}

export class StaffInvitationMaxAttemptsError extends UnprocessableEntityError {
  constructor() {
    super("Too many attempts. Ask a super admin to resend the invitation.");
  }
}

export class StaffInvitationResendCooldownError extends UnprocessableEntityError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Please wait ${retryAfterSeconds}s before requesting a new code.`);
  }
}

/** Resend requested for an already-activated account — there's no live invitation to resend (see ResendStaffInvitationUseCase's own comment). */
export class StaffAlreadyActivatedError extends ConflictError {
  constructor() {
    super("This staff member has already completed activation.");
  }
}

// ── Safety-rule errors (§6/§24 of the staff-system spec) — 403/409, not 422:
// these aren't "fix your input and retry", they're "this action is not
// permitted given who you are or the current state of the system". ──

export class SelfRoleChangeError extends ForbiddenError {
  constructor() {
    super("You cannot change your own role.");
  }
}

export class SelfDeactivationError extends ForbiddenError {
  constructor() {
    super("You cannot deactivate your own account.");
  }
}

/** The one invariant this whole module exists to protect: at least one active SUPER_ADMIN must always remain. */
export class LastSuperAdminError extends ConflictError {
  constructor(action: "deactivate" | "demote") {
    super(`Cannot ${action} the last remaining active super admin.`);
  }
}
