/**
 * Store-wide settings (AppConfig singleton, 2026-09-28). Pure — no I/O.
 * Presets are stored comma-separated in the database; everywhere above the
 * repository they are plain string arrays.
 */
/** One homepage "Shop by Budget" tile (2026-09-29). Money is integer paise (DEVELOPMENT_RULES.md #4). */
export interface BudgetTileConfig {
  label: string;
  maxPricePaise: number;
  /** Admin-uploaded cover; null = the homepage uses the top in-budget product's photo. */
  coverImageUrl: string | null;
}

export interface AppConfigValues {
  minCartQuantity: number;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
  returnsEnabled: boolean;
  /** COD orders with a delivery fee prepay that fee online before confirmation (2026-09-28). */
  codShippingUpfront: boolean;
  /** Homepage "Shop by Budget" tiles, in display order (2026-09-29). */
  budgetTiles: BudgetTileConfig[];
}

/** The three tiles GetHomePageUseCase hardcoded before 2026-09-29 — also the column default, so nothing changes on deploy. */
export const DEFAULT_BUDGET_TILES: BudgetTileConfig[] = [
  { label: "Under ₹499", maxPricePaise: 49_900, coverImageUrl: null },
  { label: "Under ₹799", maxPricePaise: 79_900, coverImageUrl: null },
  { label: "Under ₹999", maxPricePaise: 99_900, coverImageUrl: null },
];

/** Mirrors the schema column defaults — used when the singleton row doesn't exist yet (fresh database, nothing saved). */
export const DEFAULT_APP_CONFIG: AppConfigValues = {
  minCartQuantity: 1,
  presetSizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"],
  presetFabrics: ["Cotton", "Silk", "Linen", "Polyester", "Rayon", "Georgette", "Chiffon", "Crepe", "Velvet"],
  presetFits: ["Regular", "Slim", "Relaxed", "Oversized", "A-Line"],
  returnsEnabled: false,
  codShippingUpfront: false,
  budgetTiles: DEFAULT_BUDGET_TILES,
};

/**
 * Reads the `budgetTiles` JSON column defensively: it is only ever written
 * through the validated admin PATCH, but a hand-edited or malformed row must
 * never take the homepage down. Invalid entries are dropped; if nothing
 * valid remains, the defaults are used.
 */
export function parseBudgetTiles(json: unknown): BudgetTileConfig[] {
  if (!Array.isArray(json)) return DEFAULT_BUDGET_TILES;
  const tiles = json.flatMap((entry): BudgetTileConfig[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, maxPricePaise, coverImageUrl } = entry as Record<string, unknown>;
    if (typeof label !== "string" || label.trim().length === 0) return [];
    if (typeof maxPricePaise !== "number" || !Number.isInteger(maxPricePaise) || maxPricePaise <= 0) return [];
    return [{ label: label.trim(), maxPricePaise, coverImageUrl: typeof coverImageUrl === "string" && coverImageUrl.length > 0 ? coverImageUrl : null }];
  });
  return tiles.length > 0 ? tiles : DEFAULT_BUDGET_TILES;
}

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
