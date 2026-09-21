import { formatPaiseAsInr, formatPaiseAsInrCompact } from "@woobe/utils";

/** Every formatter maps a missing/non-finite value to an em dash — the dashboard must never print NaN, Infinity or "undefined". */
export const DASH = "—";

const isNum = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** ₹1,23,456.00 — full precision, for accounting-style figures. */
export function inr(paise: number | null | undefined): string {
  return isNum(paise) ? formatPaiseAsInr(Math.round(paise)) : DASH;
}

/** ₹1,23,456 — whole rupees for large headline figures; keeps paise only when it matters (under ₹100). */
export function inrShort(paise: number | null | undefined): string {
  if (!isNum(paise)) return DASH;
  const rounded = Math.round(paise);
  return Math.abs(rounded) >= 10_000 ? formatPaiseAsInrCompact(Math.round(rounded / 100) * 100) : formatPaiseAsInrCompact(rounded);
}

/** Axis-friendly: ₹1.2L, ₹45K, ₹900 (Indian lakh/crore units). */
export function inrAxis(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  if (rupees >= 10_000_000) return `${sign}₹${trim(rupees / 10_000_000)}Cr`;
  if (rupees >= 100_000) return `${sign}₹${trim(rupees / 100_000)}L`;
  if (rupees >= 1_000) return `${sign}₹${trim(rupees / 1_000)}K`;
  return `${sign}₹${Math.round(rupees)}`;
}
const trim = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toString();

/** 42,800 g -> "42.8 kg"; 350 g -> "0.35 kg". Grams in, kg out (Woobe sells by weight). */
export function kg(grams: number | null | undefined): string {
  if (!isNum(grams)) return DASH;
  const value = grams / 1000;
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 }).format(value)} kg`;
}

/** Already in kilograms (the API sends kgSold as kg). */
export function kgValue(kilograms: number | null | undefined): string {
  return isNum(kilograms) ? kg(Math.round(kilograms * 1000)) : DASH;
}

export function int(n: number | null | undefined): string {
  return isNum(n) ? new Intl.NumberFormat("en-IN").format(Math.round(n)) : DASH;
}

export function pct(n: number | null | undefined, digits = 1): string {
  return isNum(n) ? `${n.toFixed(digits).replace(/\.0+$/, "")}%` : DASH;
}

/** "+12.5%" / "-3%" — sign always shown. */
export function signedPct(n: number | null | undefined): string {
  return isNum(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1).replace(/\.0+$/, "")}%` : DASH;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-05" -> "5 Sep" (adds the year when asked). Pure string maths — no timezone surprises. */
export function shortDate(date: string, withYear = false): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

export function dateRangeLabel(from: string, to: string): string {
  return from === to ? shortDate(from, true) : `${shortDate(from, from.slice(0, 4) !== to.slice(0, 4))} – ${shortDate(to, true)}`;
}
