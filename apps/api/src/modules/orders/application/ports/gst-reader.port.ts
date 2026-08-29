export interface GstLine {
  ratePercent: number;
  taxAmountPaise: number;
}

/** Narrow port for this module's dependency on `pricing`'s GST calculation (ADR-023). */
export interface GstReaderPort {
  calculateMany(lines: { unitPricePaise: number; lineTotalPaise: number }[]): Promise<GstLine[]>;
}
