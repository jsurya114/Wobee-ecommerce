import type { ObservabilityPort } from "../../../../shared/application/ports/observability.port";
import type { InventoryRepositoryPort, ReservationOutcome } from "../ports/inventory-repository.port";

/**
 * ADR-015's `SELECT ... FOR UPDATE` reservation, exported from
 * inventory.module.ts for cross-module use — orders' checkout use-case is
 * the only caller this week, invoked inside its own Unit-of-Work transaction
 * so an insufficient-stock failure rolls back cleanly (see
 * InventoryRepositoryPort.reserveForCheckout's own doc comment on `tx`).
 *
 * Recorded even though the outcome is decided inside checkout's own
 * transaction, which may still roll back for an unrelated reason later
 * (e.g. an order-number collision retried past its limit) — "reservation
 * attempted and the row lock/stock check itself succeeded or failed" is a
 * meaningful signal on its own (stock contention rate), independent of
 * whatever else happens later in the same transaction.
 */
export class ReserveInventoryForCheckoutUseCase {
  constructor(
    private readonly inventoryRepository: InventoryRepositoryPort,
    private readonly observability: ObservabilityPort,
  ) {}

  async execute(items: { variantId: string; quantity: number }[], tx: unknown): Promise<ReservationOutcome> {
    const outcome = await this.inventoryRepository.reserveForCheckout(items, tx);
    this.observability.recordInventoryReservation({ result: outcome.success ? "success" : "failure" });
    return outcome;
  }
}
