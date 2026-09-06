import type { Role } from "@woobe/types";
import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort, StaffSummary } from "../../../auth/application/ports/auth-repository.port";
import type { RecordAuditLogUseCase } from "../../../audit/application/use-cases/record-audit-log.use-case";
import { LastSuperAdminError, SelfRoleChangeError } from "../../domain/errors/staff.errors";

/**
 * super_admin-only (MANAGE_STAFF). The highest-risk use-case in this module
 * — see §24 of the staff-system spec ("Concurrency/Transactions").
 *
 * Safety rules (enforced here, not just in the UI):
 *  - No one can change their own role, including a super_admin (SelfRoleChangeError).
 *  - Demoting a SUPER_ADMIN away from that role must never leave zero active
 *    super admins. A promotion TO super_admin can only ever increase that
 *    count, so it never needs the row lock below.
 *
 * Concurrency: a demotion always re-checks the target's CURRENT super-admin
 * membership against a freshly `SELECT ... FOR UPDATE`-locked read
 * (runWithLockedActiveSuperAdmins), never the earlier snapshot fetched
 * above — a stale-snapshot check would miss a race where the target was
 * concurrently promoted to (or demoted from) SUPER_ADMIN in between. Two
 * concurrent demotions of two different super admins serialize on this same
 * lock, so the second one to commit always sees the first's result.
 *
 * On a real role change: revokes every refresh token for the target (their
 * current access token — which still carries the OLD role — is allowed to
 * remain valid until its normal short TTL; see this module's own README /
 * the staff-system architecture report §7 for why that's the accepted,
 * pre-existing tradeoff, not a bug introduced here) and writes one
 * STAFF_ROLE_CHANGED audit event, all inside the same transaction as the
 * DB write.
 */
export class ChangeStaffRoleUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
  ) {}

  async execute(actor: { id: string; role: Role }, targetId: string, newRole: Role): Promise<StaffSummary> {
    if (actor.id === targetId) {
      throw new SelfRoleChangeError();
    }

    const target = await this.authRepository.findStaffSummaryById(targetId);
    if (!target) {
      throw new NotFoundError("Staff member not found");
    }
    if (target.role === newRole) {
      return target; // no-op — nothing to change, revoke, or audit
    }

    const fromRole = target.role;
    const runMutation = async (tx: unknown): Promise<void> => {
      await this.authRepository.changeUserRole(targetId, newRole, tx);
      await this.authRepository.revokeAllRefreshTokensForUser(targetId, tx);
      await this.recordAuditLogUseCase.execute(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: "STAFF_ROLE_CHANGED",
          entityType: "User",
          entityId: targetId,
          metadata: { fromRole, toRole: newRole },
        },
        tx,
      );
    };

    if (newRole === "SUPER_ADMIN") {
      // A promotion can only ever increase the active-super-admin count.
      await this.authRepository.transaction((tx) => runMutation(tx));
    } else {
      await this.authRepository.runWithLockedActiveSuperAdmins(async (lockedActiveSuperAdminIds, tx) => {
        if (lockedActiveSuperAdminIds.includes(targetId)) {
          const remainingWithoutTarget = lockedActiveSuperAdminIds.filter((id) => id !== targetId);
          if (remainingWithoutTarget.length === 0) {
            throw new LastSuperAdminError("demote");
          }
        }
        await runMutation(tx);
      });
    }

    // Read fresh, post-commit — changeUserRole's own return type is already
    // StaffSummary, but re-fetching here keeps this use-case's output honest
    // about "what's actually in the DB now" rather than the value threaded
    // through a transaction closure.
    const updated = await this.authRepository.findStaffSummaryById(targetId);
    if (!updated) {
      throw new NotFoundError("Staff member not found");
    }
    return updated;
  }
}
