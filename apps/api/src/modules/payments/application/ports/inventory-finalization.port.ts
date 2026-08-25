/** Narrow port for this module's dependency on `inventory` — the reservation-lifecycle half payment confirmation/failure drives (ADR-015). */
export interface InventoryFinalizationPort {
  finalize(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
  release(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
}
