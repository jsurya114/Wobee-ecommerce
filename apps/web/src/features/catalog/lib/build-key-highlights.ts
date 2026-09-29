import { formatGrams } from "@woobe/utils";
import type { ProductDetail, VariantWithPriceAndStock } from "../api/products.client";

export interface KeyHighlight {
  label: string;
  value: string;
}

/** Longer free text (e.g. a measurements paragraph) belongs in the "Details" disclosure, not an image overlay. */
const MAX_HIGHLIGHT_VALUE_LENGTH = 40;

/**
 * "Key Highlights" rows for the PDP's second gallery slide (2026-09-29).
 *
 * Only real product data, never invented. Admin-curated highlights come
 * first (see below); without them this reads what the schema stores — category ("Type"), brand, and the selected variant's fabric /
 * fit / colour, plus weight for weight-priced items. A row appears only
 * when its value exists, which is what makes the overlay adapt per product:
 * a kurta with fabric and fit shows those; a bangle with neither shows
 * type, colour and weight.
 */
export function buildKeyHighlights(
  product: Pick<ProductDetail, "category" | "brand" | "highlights">,
  variant: Pick<VariantWithPriceAndStock, "fabric" | "fit" | "color" | "weightGrams" | "ratePerKgPaise"> | undefined,
): { rows: KeyHighlight[]; curated: boolean } {
  // Admin-curated highlights (Product.highlights, set in the admin product
  // form) win — that's where saree/jewellery-specific facts like "Work" or
  // "Blouse attached" live. Otherwise fall back to the derived rows below.
  const curated = (product.highlights ?? [])
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label && row.value);
  if (curated.length > 0) {
    return { rows: curated.slice(0, 8), curated: true };
  }

  const rows: Array<[string, string | null | undefined]> = [
    ["Type", product.category.name],
    ["Brand", product.brand],
    ["Fabric", variant?.fabric],
    ["Fit", variant?.fit],
    ["Colour", variant?.color],
    // Weight is only meaningful to the shopper when it sets the price.
    ["Weight", variant && variant.ratePerKgPaise !== null && variant.weightGrams > 0 ? formatGrams(variant.weightGrams) : null],
  ];
  const derived = rows
    .map(([label, raw]) => ({ label, value: raw?.trim() ?? "" }))
    .filter((row) => row.value.length > 0 && row.value.length <= MAX_HIGHLIGHT_VALUE_LENGTH);
  return { rows: derived, curated: false };
}
