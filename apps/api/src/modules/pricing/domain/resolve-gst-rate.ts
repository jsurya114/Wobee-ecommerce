export interface GstSlabValues {
  /** null marks the top, unbounded slab. */
  maxPricePaise: number | null;
  ratePercent: number;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1, ADR-023). Picks the
 * first slab (ascending maxPricePaise, nulls-as-unbounded last) whose
 * maxPricePaise is null or >= the item's per-piece price — matches the
 * GstSlab model's own doc comment in schema.prisma exactly, so "which GST
 * rate applies" can't drift between wherever this is called from.
 */
export function resolveGstRatePercent(slabs: GstSlabValues[], unitPricePaise: number): number {
  if (slabs.length === 0) {
    throw new Error("resolveGstRatePercent: no GST slabs provided — the database is missing its seeded slabs");
  }

  const sorted = [...slabs].sort((a, b) => {
    if (a.maxPricePaise === null) return 1;
    if (b.maxPricePaise === null) return -1;
    return a.maxPricePaise - b.maxPricePaise;
  });

  const match = sorted.find((slab) => slab.maxPricePaise === null || unitPricePaise <= slab.maxPricePaise);
  // Unreachable in practice — the sorted top slab always has maxPricePaise === null
  // (or every slab is bounded, a seed-data bug, not something to silently paper over).
  if (!match) {
    throw new Error(`resolveGstRatePercent: no GST slab covers a unit price of ${unitPricePaise} paise`);
  }
  return match.ratePercent;
}
