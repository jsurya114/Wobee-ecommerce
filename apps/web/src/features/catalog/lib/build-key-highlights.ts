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
 * Only real product data, never invented: the product has no dedicated
 * highlights/attributes field, so this reads what the schema actually
 * stores — category ("Type"), brand, and the selected variant's fabric /
 * fit / colour, plus weight for weight-priced items. A row appears only
 * when its value exists, which is what makes the overlay adapt per product:
 * a kurta with fabric and fit shows those; a bangle with neither shows
 * type, colour and weight. Saree-specific facts ("Work", "Blouse attached")
 * aren't stored anywhere yet, so they are never shown.
 */
export function buildKeyHighlights(
  product: Pick<ProductDetail, "category" | "brand">,
  variant: Pick<VariantWithPriceAndStock, "fabric" | "fit" | "color" | "weightGrams" | "ratePerKgPaise"> | undefined,
): KeyHighlight[] {
  const rows: Array<[string, string | null | undefined]> = [
    ["Type", product.category.name],
    ["Brand", product.brand],
    ["Fabric", variant?.fabric],
    ["Fit", variant?.fit],
    ["Colour", variant?.color],
    // Weight is only meaningful to the shopper when it sets the price.
    ["Weight", variant && variant.ratePerKgPaise !== null && variant.weightGrams > 0 ? formatGrams(variant.weightGrams) : null],
  ];
  return rows
    .map(([label, raw]) => ({ label, value: raw?.trim() ?? "" }))
    .filter((row) => row.value.length > 0 && row.value.length <= MAX_HIGHLIGHT_VALUE_LENGTH);
}
