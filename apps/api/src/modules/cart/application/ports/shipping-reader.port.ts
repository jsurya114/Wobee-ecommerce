export interface ShippingProgress {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  shippingFeePaise: number;
  gramsToMinimum: number;
  gramsToFreeDelivery: number;
}

/** Narrow port for this module's one dependency on `shipping` — same DIP rationale as variant-catalog.port.ts. */
export interface ShippingReaderPort {
  evaluate(totalWeightGrams: number): Promise<ShippingProgress>;
}
