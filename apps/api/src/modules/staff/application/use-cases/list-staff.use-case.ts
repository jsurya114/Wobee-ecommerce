import type { AuthRepositoryPort, ListStaffFilter, StaffSummary } from "../../../auth/application/ports/auth-repository.port";

/** super_admin-only (MANAGE_STAFF). Deliberately unpaginated (§8/§33 of the staff-system spec) — expected staff headcount is small; add pagination later if that stops being true rather than building it speculatively now. */
export class ListStaffUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  execute(filter: ListStaffFilter): Promise<StaffSummary[]> {
    return this.authRepository.findStaffForAdmin(filter);
  }
}
