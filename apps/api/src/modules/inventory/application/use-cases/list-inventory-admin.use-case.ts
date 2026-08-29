import type { ListInventoryAdminFilter, ListInventoryAdminResult } from "../ports/inventory-repository.port";
import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/** Admin inventory dashboard (week2 (1).md §15) — every variant's stock level, with low/out-of-stock filtering. RBAC-gated at the route (MANAGE_INVENTORY). */
export class ListInventoryAdminUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(filter: ListInventoryAdminFilter): Promise<ListInventoryAdminResult> {
    return this.inventoryRepository.findAllForAdmin(filter);
  }
}
