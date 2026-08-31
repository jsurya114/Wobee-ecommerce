/**
 * Narrow port for this module's one dependency on `pricing` — decouples
 * products' application layer from pricing's concrete use-case class
 * (DIP), even though the composition root wires it with a one-line
 * pass-through adapter rather than a dedicated adapter file (the
 * "adaptation" is trivial: no translation logic needed).
 */
import type { PricingMode } from "@woobe/types";

export interface PricingReaderPort {
  calculateMany(
    inputs: { pricingMode: PricingMode; weightGrams: number; ratePerKgOverridePaise: number | null; fixedPricePaise: number | null }[],
  ): Promise<{ pricePaise: number; ratePerKgPaise: number | null }[]>;
}
