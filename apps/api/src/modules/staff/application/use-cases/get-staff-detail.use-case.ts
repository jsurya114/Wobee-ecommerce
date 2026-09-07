import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort, StaffSummary } from "../../../auth/application/ports/auth-repository.port";

/** super_admin-only (MANAGE_STAFF). 404s for a customer id or an unknown id — same "not found and not a customer are both a 404 here" shape GetCustomerForAdminUseCase already uses, mirrored. */
export class GetStaffDetailUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(id: string): Promise<StaffSummary> {
    const staff = await this.authRepository.findStaffSummaryById(id);
    if (!staff) {
      throw new NotFoundError("Staff member not found");
    }
    return staff;
  }
}
