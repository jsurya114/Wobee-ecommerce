export interface SizeChoice {
  /** A representative variant id for this size — the first in-stock match, or the first variant of this size if none are in stock (so it can still render, disabled). */
  variantId: string;
  size: string;
  inStock: boolean;
  availableQuantity: number;
}

/**
 * Reduces a product's colour×size variant matrix down to one row per size —
 * what the compact Quick Add / cart size-selector shows. Colour isn't part
 * of this task's scope, so when a size has several in-stock colours this
 * just picks one representative variant for it (deliberately, not "invent a
 * size" — the size itself is never guessed, only which colour backs it).
 */
export function groupVariantsBySize(
  variants: { id: string; size: string; inStock: boolean; availableQuantity: number }[],
): SizeChoice[] {
  const bySize = new Map<string, SizeChoice>();

  for (const variant of variants) {
    const existing = bySize.get(variant.size);
    if (!existing) {
      bySize.set(variant.size, {
        variantId: variant.id,
        size: variant.size,
        inStock: variant.inStock,
        availableQuantity: variant.availableQuantity,
      });
      continue;
    }
    if (variant.inStock) {
      existing.availableQuantity = existing.inStock ? existing.availableQuantity + variant.availableQuantity : variant.availableQuantity;
      if (!existing.inStock) {
        existing.variantId = variant.id;
        existing.inStock = true;
      }
    }
  }

  return Array.from(bySize.values());
}
