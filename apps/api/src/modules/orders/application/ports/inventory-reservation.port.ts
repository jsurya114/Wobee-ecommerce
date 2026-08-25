export interface InsufficientStockLine {
  variantId: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface ReservationOutcome {
  success: boolean;
  insufficient: InsufficientStockLine[];
}

/**
 * Narrow port for this module's dependency on `inventory` — ADR-015's
 * `SELECT ... FOR UPDATE` reservation, run inside checkout's own
 * transaction (see TransactionPort) so a failed reservation rolls back the
 * whole checkout attempt, not just the inventory half of it.
 */
export interface InventoryReservationPort {
  reserveForCheckout(items: { variantId: string; quantity: number }[], tx: unknown): Promise<ReservationOutcome>;
}
