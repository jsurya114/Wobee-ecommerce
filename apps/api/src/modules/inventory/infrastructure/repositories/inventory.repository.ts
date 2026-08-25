import { Prisma, prisma } from "@woobe/database";
import type {
  InventoryRepositoryPort,
  InsufficientStockLine,
  ReservationOutcome,
} from "../../application/ports/inventory-repository.port";

/** The only shape `reserveForCheckout`'s opaque `tx` handle is ever cast to — see that method's own comment. */
type PrismaTx = Prisma.TransactionClient;

interface LockedInventoryRow {
  id: string;
  variantId: string;
  quantityAvailable: number;
  quantityReserved: number;
}

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

  async reserveForCheckout(
    items: { variantId: string; quantity: number }[],
    tx: unknown,
  ): Promise<ReservationOutcome> {
    if (items.length === 0) return { success: true, insufficient: [] };

    const client = tx as PrismaTx;
    const variantIds = items.map((item) => item.variantId);

    // Row-lock every inventory row for every requested variant BEFORE reading
    // any of them (ADR-015) — this is what makes "two near-simultaneous
    // checkouts on a stock=1 item" resolve to exactly one winner: the second
    // transaction's FOR UPDATE blocks on Postgres's row lock until the first
    // commits (reserving the unit) or rolls back, and only then sees the
    // up-to-date quantityReserved.
    const rows = await client.$queryRaw<LockedInventoryRow[]>`
      SELECT "id", "variantId", "quantityAvailable", "quantityReserved"
      FROM "inventory"
      WHERE "variantId" = ANY(${variantIds}::text[])
      ORDER BY "id"
      FOR UPDATE
    `;

    const rowsByVariant = new Map<string, LockedInventoryRow[]>();
    for (const row of rows) {
      const existing = rowsByVariant.get(row.variantId);
      if (existing) existing.push(row);
      else rowsByVariant.set(row.variantId, [row]);
    }

    const insufficient: InsufficientStockLine[] = [];
    for (const item of items) {
      const variantRows = rowsByVariant.get(item.variantId) ?? [];
      const availableQuantity = variantRows.reduce((sum, row) => sum + (row.quantityAvailable - row.quantityReserved), 0);
      if (availableQuantity < item.quantity) {
        insufficient.push({ variantId: item.variantId, requestedQuantity: item.quantity, availableQuantity });
      }
    }

    // All-or-nothing: don't reserve any line if even one is short — the
    // caller rolls back the whole transaction, nothing partially reserved.
    if (insufficient.length > 0) {
      return { success: false, insufficient };
    }

    // Locks are already held; allocate each item's quantity across its
    // (single, at launch) warehouse rows, greedily filling from the first
    // row with remaining capacity — generalizes to multiple warehouses
    // without needing a rewrite when a second one exists (ADR-015).
    for (const item of items) {
      let remaining = item.quantity;
      for (const row of rowsByVariant.get(item.variantId) ?? []) {
        if (remaining <= 0) break;
        const rowAvailable = row.quantityAvailable - row.quantityReserved;
        if (rowAvailable <= 0) continue;
        const allocate = Math.min(rowAvailable, remaining);
        await client.inventory.update({
          where: { id: row.id },
          data: { quantityReserved: { increment: allocate } },
        });
        remaining -= allocate;
      }
    }

    return { success: true, insufficient: [] };
  }
}
