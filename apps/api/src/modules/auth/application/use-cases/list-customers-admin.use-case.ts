import type { AuthRepositoryPort, ListCustomersFilter, ListCustomersResult } from "../ports/auth-repository.port";

/** Admin customer list (week2 (1).md §19). RBAC-gated at the route (MANAGE_CUSTOMERS — see permissions.ts's own comment on why this is super_admin only). */
export class ListCustomersAdminUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  execute(filter: ListCustomersFilter): Promise<ListCustomersResult> {
    return this.authRepository.findCustomersForAdmin(filter);
  }
}
