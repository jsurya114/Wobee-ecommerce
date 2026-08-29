/**
 * Narrow port for this module's one dependency on `pricing` — decouples
 * products' application layer from pricing's concrete use-case class
 * (DIP), even though the composition root wires it with a one-line
 * pass-through adapter rather than a dedicated adapter file (the
 * "adaptation" is trivial: no translation logic needed).
 */
export interface PricingReaderPort {
  calculateMany(
    inputs: { weightGrams: number; ratePerKgOverridePaise: number | null }[],
  ): Promise<{ pricePaise: number; ratePerKgPaise: number }[]>;
}
