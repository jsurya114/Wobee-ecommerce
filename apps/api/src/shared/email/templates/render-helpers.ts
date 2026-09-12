import { formatPaiseAsInr } from "@woobe/utils";

/**
 * The notification payload reaching a template is `Record<string, unknown>`
 * (it round-trips through Postgres JSON). Templates must be defensive:
 * coerce what they can, and treat a missing OPTIONAL field as "omit that
 * line" rather than throwing. A missing *required* field (`contactEmail`)
 * is caught by `NodemailerEmailProvider` before any renderer runs.
 */

export function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function bool(value: unknown): boolean {
  return value === true || value === "true";
}

/** paise -> "₹1,234.00", or a dash when the amount isn't a usable integer. */
export function money(value: unknown): string {
  const n = num(value);
  return n !== undefined && Number.isInteger(n) ? formatPaiseAsInr(n) : "—";
}

export function greeting(name: unknown): string {
  const n = str(name);
  return n ? `Hi ${n},` : "Hi,";
}
