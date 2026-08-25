import { Prisma, prisma } from "@woobe/database";
import type {
  InventoryRepositoryPort,
  InsufficientStockLine,
  ReservationOutcome,
} from "../../application/ports/inventory-repository.port";

/** The only shape a `tx` handle from this module's write methods is ever cast to — see each method's own port comment. */
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
    const rowsByVariant = await this.lockRowsForVariants(client, items.map((item) => item.variantId));

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
      await this.incrementReservedAcrossRows(client, rowsByVariant.get(item.variantId) ?? [], item.quantity);
    }

    return { success: true, insufficient: [] };
  }

  async finalizeReservation(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    if (items.length === 0) return;
    const client = tx as PrismaTx;
    const rowsByVariant = await this.lockRowsForVariants(client, items.map((item) => item.variantId));
    for (const item of items) {
      await this.decrementReservedAcrossRows(client, rowsByVariant.get(item.variantId) ?? [], item.quantity, {
        deductAvailable: true, // confirmed sale — actually deduct stock
      });
    }
  }

  async releaseReservation(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    if (items.length === 0) return;
    const client = tx as PrismaTx;
    const rowsByVariant = await this.lockRowsForVariants(client, items.map((item) => item.variantId));
    for (const item of items) {
      await this.decrementReservedAcrossRows(client, rowsByVariant.get(item.variantId) ?? [], item.quantity, {
        deductAvailable: false, // give the hold back — nothing was ever sold
      });
    }
  }

  /**
   * Shared by reserve/finalize/release: `SELECT ... FOR UPDATE` on every
   * requested variant's inventory row(s), inside the caller's transaction
   * (ADR-015), before any of the three decide what to write. This is what
   * makes concurrent reservation attempts, and a reservation racing its own
   * later finalize/release, serialize correctly instead of interleaving.
   */
  private async lockRowsForVariants(client: PrismaTx, variantIds: string[]): Promise<Map<string, LockedInventoryRow[]>> {
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
    return rowsByVariant;
  }

  /**
   * `reserveForCheckout`'s allocation step: increments `quantityReserved`,
   * greedily across the already-locked rows, bounded by each row's
   * remaining *available* capacity (`quantityAvailable - quantityReserved`).
   * Caller (reserveForCheckout) already verified total available capacity
   * covers `quantity` across all rows combined before calling this.
   */
  private async incrementReservedAcrossRows(client: PrismaTx, rows: LockedInventoryRow[], quantity: number): Promise<void> {
    let remaining = quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      const rowAvailable = row.quantityAvailable - row.quantityReserved;
      if (rowAvailable <= 0) continue;
      const allocate = Math.min(rowAvailable, remaining);
      await client.inventory.update({ where: { id: row.id }, data: { quantityReserved: { increment: allocate } } });
      remaining -= allocate;
    }
  }

  /**
   * `finalizeReservation`/`releaseReservation`'s allocation step: decrements
   * `quantityReserved` (and `quantityAvailable` too when `deductAvailable`
   * — the only difference between the two), greedily across the
   * already-locked rows, bounded by each row's existing `quantityReserved`.
   * Caller guarantees `quantity` doesn't exceed the rows' total
   * `quantityReserved` — true for every caller here, since it's always the
   * same quantity a prior `reserveForCheckout` call already reserved for
   * this exact order.
   */
  private async decrementReservedAcrossRows(
    client: PrismaTx,
    rows: LockedInventoryRow[],
    quantity: number,
    options: { deductAvailable: boolean },
  ): Promise<void> {
    let remaining = quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      const rowReserved = row.quantityReserved;
      if (rowReserved <= 0) continue;
      const allocate = Math.min(rowReserved, remaining);
      await client.inventory.update({
        where: { id: row.id },
        data: {
          quantityReserved: { decrement: allocate },
          ...(options.deductAvailable ? { quantityAvailable: { decrement: allocate } } : {}),
        },
      });
      remaining -= allocate;
    }
  }
}
