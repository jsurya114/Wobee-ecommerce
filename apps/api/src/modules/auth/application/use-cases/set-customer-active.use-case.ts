import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort, CustomerSummary } from "../ports/auth-repository.port";

/** "Account status" (week2 (1).md §19) — see AuthRepositoryPort.setUserActive's own comment for what this already enforces (LoginUserUseCase/RefreshTokenUseCase both check `isActive`). Scoped to customers only, same as GetCustomerForAdminUseCase — this is not how a staff account gets disabled. */
export class SetCustomerActiveUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(userId: string, isActive: boolean): Promise<CustomerSummary> {
    const existing = await this.authRepository.findCustomerSummaryById(userId);
    if (!existing) {
      throw new NotFoundError("Customer not found");
    }
    return this.authRepository.setUserActive(userId, isActive);
  }
}
