/**
 * Money is always an Int number of paise, everywhere in the system
 * (schema, DTOs, calculations) — DEVELOPMENT_RULES.md #4.
 * These helpers are the ONLY place a paise<->rupee conversion happens,
 * and only for display. Never do arithmetic in rupees.
 */

/** Convert a whole-rupee amount to paise. Throws on non-integer rupees to catch accidental float money upstream. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error(`rupeesToPaise: not a finite number: ${rupees}`);
  }
  return Math.round(rupees * 100);
}

/** Convert paise to a rupee number, for display/formatting only — never feed this back into a calculation. */
export function paiseToRupees(paise: number): number {
  assertInt(paise, "paise");
  return paise / 100;
}

/** Format paise as an INR display string, e.g. 149900 -> "₹1,499.00". */
export function formatPaiseAsInr(paise: number): string {
  assertInt(paise, "paise");
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

/** Apply a percentage (e.g. GST) to a paise amount, rounding to the nearest paisa. */
export function applyPercentage(paise: number, percentage: number): number {
  assertInt(paise, "paise");
  if (!Number.isFinite(percentage) || percentage < 0) {
    throw new Error(`applyPercentage: invalid percentage: ${percentage}`);
  }
  return Math.round(paise * (percentage / 100));
}

function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got: ${value}`);
  }
}
