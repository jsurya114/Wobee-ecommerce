/**
 * Store-wide settings (AppConfig singleton, 2026-09-28). Pure — no I/O.
 * Presets are stored comma-separated in the database; everywhere above the
 * repository they are plain string arrays.
 */
export interface AppConfigValues {
  minCartQuantity: number;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
  returnsEnabled: boolean;
  /** COD orders with a delivery fee prepay that fee online before confirmation (2026-09-28). */
  codShippingUpfront: boolean;
}

/** Mirrors the schema column defaults — used when the singleton row doesn't exist yet (fresh database, nothing saved). */
export const DEFAULT_APP_CONFIG: AppConfigValues = {
  minCartQuantity: 1,
  presetSizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"],
  presetFabrics: ["Cotton", "Silk", "Linen", "Polyester", "Rayon", "Georgette", "Chiffon", "Crepe", "Velvet"],
  presetFits: ["Regular", "Slim", "Relaxed", "Oversized", "A-Line"],
  returnsEnabled: false,
  codShippingUpfront: false,
};

export function splitPresetList(csv: string): string[] {
  return csv
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function joinPresetList(values: string[]): string {
  return values.map((value) => value.trim()).join(",");
}

/** Total units in the bag (sum of quantities), compared against minCartQuantity at checkout. */
export function missingItemsForMinimum(totalQuantity: number, minCartQuantity: number): number {
  return Math.max(0, minCartQuantity - totalQuantity);
}
