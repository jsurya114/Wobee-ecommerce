import type { Role } from "@woobe/types";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { InventoryAdjustmentResult, InventoryRepositoryPort } from "../ports/inventory-repository.port";

/**
 * Manual admin stock adjustment (week2 (1).md §15 — "authorized, validated,
 * transaction-safe, auditable"). Authorization is the route's own RBAC
 * guard (MANAGE_INVENTORY); validation + transaction-safety live in
 * InventoryRepository.adjustQuantity (needs the freshly row-locked values
 * to validate against, same reasoning reserveForCheckout's own validation
 * lives in the repository, not a separate domain call here). This
 * use-case's own job is exactly the "auditable" part: every adjustment,
 * successful or not, is who did it and why.
 */
export class AdjustInventoryUseCase {
  constructor(
    private readonly inventoryRepository: InventoryRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
  ) {}

  async execute(variantId: string, delta: number, reason: string, actor: { id: string; role: Role }): Promise<InventoryAdjustmentResult> {
    const result = await this.inventoryRepository.adjustQuantity(variantId, delta);
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "INVENTORY_ADJUSTED",
      entityType: "ProductVariant",
      entityId: variantId,
      metadata: { delta, reason, newQuantityAvailable: result.quantityAvailable },
    });
    return result;
  }
}
