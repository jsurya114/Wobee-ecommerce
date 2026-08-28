import { Prisma, prisma } from "@woobe/database";
import { NotFoundError, UnprocessableEntityError } from "../../../../shared/errors";
import { LOW_STOCK_THRESHOLD, validateInventoryAdjustment } from "../../domain/validate-inventory-adjustment";
import type {
  AdminInventoryRow,
  InventoryRepositoryPort,
  InsufficientStockLine,
  InventoryAdjustmentResult,
  ListInventoryAdminFilter,
  ListInventoryAdminResult,
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

  /**
   * One query, catalogue-wide — same shape as findAvailableQuantitiesByVariantIds
   * but without a variantId filter and aggregated in Postgres via groupBy
   * rather than in application code. Fine at this catalogue's current scale
   * (ADR-012's OpenSearch/heavier-infra trigger — 50k products, p95 > 300ms —
   * is nowhere close); revisit if that trigger is ever hit.
   */
  async findInStockVariantIds(): Promise<string[]> {
    const rows = await prisma.inventory.groupBy({
      by: ["variantId"],
      _sum: { quantityAvailable: true, quantityReserved: true },
    });
    return rows
      .filter((row) => (row._sum.quantityAvailable ?? 0) - (row._sum.quantityReserved ?? 0) > 0)
      .map((row) => row.variantId);
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
   * Week 2 Day 0 remediation: restores stock for a cancelled order whose
   * reservation was already finalized (`quantityReserved` for these items
   * is already 0 — see this method's own port doc comment for why
   * `releaseReservation` was the wrong operation here). Unlike the
   * reserve/finalize/release trio, there's no existing `quantityReserved`
   * amount to bound this by — it's a straight `quantityAvailable`
   * increment. Locks first, same as the others, so this can't race a
   * concurrent adjustment to the same variant's rows.
   *
   * Single-warehouse simplification (matches `incrementReservedAcrossRows`'s
   * own note): credits the full quantity to the first locked row rather
   * than trying to reconstruct which specific warehouse row(s) the original
   * sale drew from — correct as long as a variant has one inventory row,
   * revisit if/when a second warehouse exists.
   */
  async restockFinalizedSale(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    if (items.length === 0) return;
    const client = tx as PrismaTx;
    const rowsByVariant = await this.lockRowsForVariants(client, items.map((item) => item.variantId));
    for (const item of items) {
      const rows = rowsByVariant.get(item.variantId) ?? [];
      const target = rows[0];
      if (!target) continue; // defensive — a variant that was previously finalized must have had a row
      await client.inventory.update({
        where: { id: target.id },
        data: { quantityAvailable: { increment: item.quantity } },
      });
    }
  }

  async initializeForVariant(variantId: string, quantityAvailable: number): Promise<void> {
    const warehouse = await prisma.warehouse.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!warehouse) {
      // Defensive — every environment seeds one active warehouse
      // (ADR-015); genuinely unreachable outside a broken/empty database.
      throw new Error("No active warehouse configured — cannot initialize inventory for a new variant");
    }
    await prisma.inventory.create({ data: { variantId, warehouseId: warehouse.id, quantityAvailable, quantityReserved: 0 } });
  }

  async findAllForAdmin(filter: ListInventoryAdminFilter): Promise<ListInventoryAdminResult> {
    // Reaches through Inventory -> ProductVariant -> Product for display
    // fields (read-only) — see AdminInventoryRow's own doc comment on the
    // port for why this is a deliberate, minimal extension of an existing
    // precedent (OrderRepository.hasUserPurchasedProduct's relation filter
    // into ProductVariant), not a new cross-module boundary violation.
    const where: Prisma.InventoryWhereInput = {
      ...(filter.search
        ? {
            variant: {
              OR: [{ sku: { contains: filter.search, mode: "insensitive" } }, { product: { name: { contains: filter.search, mode: "insensitive" } } }],
            },
          }
        : {}),
    };

    // Low/out-of-stock filtering is done in application code below (it
    // depends on quantityAvailable - quantityReserved, which Postgres can't
    // filter on directly through Prisma's query builder without raw SQL) —
    // acceptable at this catalogue's scale, same reasoning
    // InventoryRepository.findInStockVariantIds's own comment already gives
    // for a full-table aggregate query here.
    const rows = await prisma.inventory.findMany({
      where,
      orderBy: { variant: { sku: "asc" } },
      select: {
        variantId: true,
        quantityAvailable: true,
        quantityReserved: true,
        variant: { select: { sku: true, color: true, size: true, product: { select: { id: true, name: true } } } },
      },
    });

    const mapped: AdminInventoryRow[] = rows.map((row) => ({
      variantId: row.variantId,
      productId: row.variant.product.id,
      productName: row.variant.product.name,
      sku: row.variant.sku,
      color: row.variant.color,
      size: row.variant.size,
      quantityAvailable: row.quantityAvailable,
      quantityReserved: row.quantityReserved,
    }));

    const filtered = mapped.filter((row) => {
      const sellable = row.quantityAvailable - row.quantityReserved;
      if (filter.outOfStockOnly && sellable > 0) return false;
      if (filter.lowStockOnly && !(sellable > 0 && sellable <= LOW_STOCK_THRESHOLD)) return false;
      return true;
    });

    const total = filtered.length;
    const start = (filter.page - 1) * filter.pageSize;
    return { items: filtered.slice(start, start + filter.pageSize), total };
  }

  async adjustQuantity(variantId: string, delta: number): Promise<InventoryAdjustmentResult> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedInventoryRow[]>`
        SELECT "id", "variantId", "quantityAvailable", "quantityReserved"
        FROM "inventory"
        WHERE "variantId" = ${variantId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new NotFoundError("This variant has no inventory record");
      }

      const validation = validateInventoryAdjustment(row, delta);
      if (!validation.ok) {
        throw new UnprocessableEntityError(validation.reason ?? "Invalid inventory adjustment");
      }

      const updated = await tx.inventory.update({
        where: { id: row.id },
        data: { quantityAvailable: validation.newQuantityAvailable },
      });
      return { variantId, quantityAvailable: updated.quantityAvailable, quantityReserved: updated.quantityReserved };
    });
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
