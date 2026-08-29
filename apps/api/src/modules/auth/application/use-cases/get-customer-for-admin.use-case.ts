import { NotFoundError } from "../../../../shared/errors";
import type { AuthRepositoryPort, CustomerSummary } from "../ports/auth-repository.port";

/** Admin customer detail (week2 (1).md §19) — 404s for a staff/admin account id, not just a missing one: this surface is scoped to customers only, same reasoning CustomerSummary's own doc comment gives for the list. Returns CustomerSummary (with createdAt), not UserEntity — the admin UI displays "joined" date same as the list row does. */
export class GetCustomerForAdminUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async execute(userId: string): Promise<CustomerSummary> {
    const customer = await this.authRepository.findCustomerSummaryById(userId);
    if (!customer) {
      throw new NotFoundError("Customer not found");
    }
    return customer;
  }
}
