/** Narrow port for this module's one dependency on `inventory` — same DIP rationale as pricing-reader.port.ts. */
export interface InventoryReaderPort {
  getAvailableQuantities(variantIds: string[]): Promise<Map<string, number>>;
}
