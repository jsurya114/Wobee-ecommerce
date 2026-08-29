/** Narrow port for this module's one dependency on `pricing` — same DIP rationale as variant-catalog.port.ts. */
export interface PricingReaderPort {
  calculateMany(
    inputs: { weightGrams: number; ratePerKgOverridePaise: number | null }[],
  ): Promise<{ pricePaise: number; ratePerKgPaise: number }[]>;
}
