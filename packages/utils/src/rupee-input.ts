/**
 * Rupee <-> paise conversion for admin form INPUTS (2026-09-28). The API only
 * ever receives integer paise (DEVELOPMENT_RULES.md #4); this is the display
 * boundary where an admin types "₹12.50". Parsing works on the string itself —
 * never `Number(x) * 100` — so "0.29" can't become 28.999999… paise.
 */

const RUPEE_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export type RupeeParseResult = { ok: true; paise: number } | { ok: false; error: string };

export function parseRupeeInputToPaise(input: string, options: { allowZero?: boolean } = {}): RupeeParseResult {
  const value = input.trim();
  if (value === "") {
    return { ok: false, error: "Enter an amount in rupees." };
  }
  if (/^\d+\.\d{3,}$/.test(value)) {
    return { ok: false, error: "Price can have at most 2 decimal places (paise)." };
  }
  const match = RUPEE_PATTERN.exec(value);
  if (!match) {
    return { ok: false, error: "Enter a valid amount, e.g. 499 or 499.50." };
  }
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) {
    return { ok: false, error: "That amount is too large." };
  }
  if (paise === 0 && !options.allowZero) {
    return { ok: false, error: "Amount must be greater than ₹0." };
  }
  return { ok: true, paise };
}

/** Integer paise -> the editable rupee string ("1250" -> "12.50", "1200" -> "12"). */
export function paiseToRupeeInput(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`paiseToRupeeInput: paise must be an integer, got ${paise}`);
  }
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return `${sign}${remainder === 0 ? rupees : `${rupees}.${String(remainder).padStart(2, "0")}`}`;
}
