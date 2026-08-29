/**
 * Weight is always an Int number of grams, everywhere in the system
 * (schema, DTOs, calculations) — DEVELOPMENT_RULES.md #4.
 */

/** Convert a gram amount to kilograms, for display/formatting only. */
export function gramsToKg(grams: number): number {
  assertInt(grams, "grams");
  return grams / 1000;
}

/** Convert whole/fractional kilograms to an integer gram amount. */
export function kgToGrams(kg: number): number {
  if (!Number.isFinite(kg)) {
    throw new Error(`kgToGrams: not a finite number: ${kg}`);
  }
  return Math.round(kg * 1000);
}

/** Format grams for display, e.g. 1250 -> "1.25kg", 350 -> "350g". */
export function formatGrams(grams: number): string {
  assertInt(grams, "grams");
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2).replace(/\.?0+$/, "")}kg`;
  }
  return `${grams}g`;
}

/**
 * Weight-based price formula (the core Woobe pricing mechanic — plan.md §6):
 * price = weightGrams * ratePerKgPaise / 1000, rounded to the nearest paisa.
 * Pure function — the `pricing` module's domain layer calls this with the
 * effective rate (variant override, falling back to the admin default),
 * never with a client-supplied price. See DEVELOPMENT_RULES.md #1.
 */
export function calculateWeightBasedPricePaise(weightGrams: number, ratePerKgPaise: number): number {
  assertInt(weightGrams, "weightGrams");
  assertInt(ratePerKgPaise, "ratePerKgPaise");
  if (weightGrams < 0 || ratePerKgPaise < 0) {
    throw new Error("calculateWeightBasedPricePaise: weight and rate must be non-negative");
  }
  return Math.round((weightGrams * ratePerKgPaise) / 1000);
}

function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got: ${value}`);
  }
}
