import type { Role } from "@woobe/types";
import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort, StaffSummary } from "../../../auth/application/ports/auth-repository.port";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import { LastSuperAdminError, SelfDeactivationError } from "../../domain/errors/staff.errors";

/**
 * super_admin-only (MANAGE_STAFF). Same concurrency shape as
 * ChangeStaffRoleUseCase (see its own doc comment for the full reasoning) —
 * deactivating a currently-active SUPER_ADMIN always re-checks membership
 * against a freshly locked read (runWithLockedActiveSuperAdmins), never the
 * earlier snapshot; reactivating can only ever increase the active count,
 * so it never needs the lock.
 *
 * Self-deactivation is rejected outright, symmetrically with self-role-change
 * (in practice a deactivated account can't be logged in to reactivate itself
 * anyway, but the guard is cheap and keeps the rule uniform for both
 * directions rather than relying on that incidental fact).
 *
 * On deactivation: revokes every refresh token for the target immediately —
 * their next refresh attempt and any new login attempt are rejected
 * (AuthRepositoryPort.setUserActive's own comment); their current access
 * token remains valid until its normal short TTL, the same accepted
 * pre-existing tradeoff as a role change. Reactivating does NOT restore the
 * revoked sessions — the staff member must log in again (§ "Reactivation"
 * of the staff-system spec).
 */
export class SetStaffActiveUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute(actor: { id: string; role: Role }, targetId: string, isActive: boolean): Promise<StaffSummary> {
    if (actor.id === targetId) {
      throw new SelfDeactivationError();
    }

    const target = await this.authRepository.findStaffSummaryById(targetId);
    if (!target) {
      throw new NotFoundError("Staff member not found");
    }
    if (target.isActive === isActive) {
      return target; // no-op — nothing to change, revoke, or audit
    }

    const runMutation = async (tx: unknown): Promise<void> => {
      await this.authRepository.setUserActive(targetId, isActive, tx);
      if (!isActive) {
        await this.authRepository.revokeAllRefreshTokensForUser(targetId, tx);
      }
      await this.recordAuditLogUseCase.execute(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
          entityType: "User",
          entityId: targetId,
        },
        tx,
      );
    };

    if (isActive) {
      // Reactivating can only ever increase the active-super-admin count.
      await this.authRepository.transaction((tx) => runMutation(tx));
    } else {
      await this.authRepository.runWithLockedActiveSuperAdmins(async (lockedActiveSuperAdminIds, tx) => {
        if (lockedActiveSuperAdminIds.includes(targetId)) {
          const remainingWithoutTarget = lockedActiveSuperAdminIds.filter((id) => id !== targetId);
          if (remainingWithoutTarget.length === 0) {
            throw new LastSuperAdminError("deactivate");
          }
        }
        await runMutation(tx);
      });
    }

    const updated = await this.authRepository.findStaffSummaryById(targetId);
    if (!updated) {
      throw new NotFoundError("Staff member not found");
    }
    return updated;
  }
}
