import { prisma } from "@woobe/database";
import type { InventoryRepositoryPort } from "../../application/ports/inventory-repository.port";

/**
 * ADR-010: the ONLY file in the inventory module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class InventoryRepository implements InventoryRepositoryPort {
  async findAvailableQuantitiesByVariantIds(variantIds: string[]): Promise<Map<string, number>> {
    const rows = await prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, quantityAvailable: true, quantityReserved: true },
    });

    const totals = new Map<string, number>();
    for (const row of rows) {
      const available = row.quantityAvailable - row.quantityReserved;
      totals.set(row.variantId, (totals.get(row.variantId) ?? 0) + available);
    }
    return totals;
  }
}
