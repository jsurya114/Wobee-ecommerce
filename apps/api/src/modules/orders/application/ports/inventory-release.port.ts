/** Narrow port for this module's dependency on `inventory`'s reservation-release half (ADR-015) — same underlying use-case `payments` already wires into its own, differently-shaped InventoryFinalizationPort (this codebase's established one-port-shape-per-consuming-module convention). */
export interface InventoryReleasePort {
  release(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
}
