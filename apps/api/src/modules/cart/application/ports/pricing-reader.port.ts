import type { PricingMode } from "@woobe/types";

/** Narrow port for this module's one dependency on `pricing` — same DIP rationale as variant-catalog.port.ts. */
export interface PricingReaderPort {
  calculateMany(
    inputs: { pricingMode: PricingMode; weightGrams: number; ratePerKgOverridePaise: number | null; fixedPricePaise: number | null }[],
  ): Promise<{ pricePaise: number; ratePerKgPaise: number | null }[]>;
}
