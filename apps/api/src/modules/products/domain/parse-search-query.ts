/**
 * Smart search (2026-09-29) — turns a free-text shopper query such as
 * "rose color kurti with relaxed fit small size" into the words left to
 * match against product names plus the variant attributes it mentions:
 * `{ keywords: "kurti", colors: ["rose"], sizes: ["S"], fits: ["relaxed"], fabrics: [] }`.
 *
 * Pure and deterministic — a fixed dictionary (optionally extended with the
 * admin's own AppConfig presets), no I/O, no NLP service. Phrases are matched
 * longest-first ("extra large" before "large", "free size" before the filler
 * word "size"), so a multi-word value is never split into two wrong ones.
 */

export interface ParsedSearchQuery {
  /** Remaining words, space-joined, after known attributes and filler are removed. */
  keywords: string;
  /** Lowercase dictionary colours, e.g. "rose" — matched as a substring of a variant's colour ("Dusty Rose"). */
  colors: string[];
  /** Canonical sizes, e.g. "S", "XL", "Free Size" — matched case-insensitively against a variant's size. */
  sizes: string[];
  /** Lowercase fabrics, e.g. "cotton" — matched as a substring of a variant's fabric. */
  fabrics: string[];
  /** Lowercase fits, e.g. "relaxed" — matched as a substring of a variant's fit. */
  fits: string[];
}

/** Extra values to recognise, typically AppConfig's presetSizes/presetFabrics/presetFits. */
export interface SearchVocabularyExtras {
  sizes?: string[];
  fabrics?: string[];
  fits?: string[];
}

const COLORS = [
  "rose", "red", "blue", "green", "black", "white", "pink", "yellow", "maroon", "navy", "beige", "cream", "peach", "lavender",
  "teal", "burgundy", "coral", "olive", "grey", "gray", "mustard", "gold", "silver", "orange", "purple", "brown",
  "ivory", "indigo", "tan", "rust", "sage", "charcoal", "blush", "wine", "magenta", "turquoise", "khaki", "off white", "dusty rose",
];

const FABRICS = ["cotton", "silk", "linen", "polyester", "rayon", "georgette", "chiffon", "crepe", "velvet", "net", "satin", "organza", "lycra", "denim", "khadi"];

const FITS = ["regular", "slim", "relaxed", "oversized", "a-line", "fitted", "flared", "straight"];

/** Spoken or alternate forms → canonical size. Canonical sizes map to themselves (lowercased key). */
const SIZE_ALIASES: Record<string, string> = {
  xs: "XS",
  "extra small": "XS",
  s: "S",
  small: "S",
  m: "M",
  medium: "M",
  l: "L",
  large: "L",
  xl: "XL",
  "extra large": "XL",
  xxl: "XXL",
  "2xl": "XXL",
  "double xl": "XXL",
  "3xl": "3XL",
  xxxl: "3XL",
  "free size": "Free Size",
  freesize: "Free Size",
  "one size": "Free Size",
};

/** Colour spellings that mean the same thing — every form is searched. */
const COLOR_SYNONYMS: Record<string, string[]> = { grey: ["grey", "gray"], gray: ["grey", "gray"] };

/** "Free Size" and "One Size" are both used for the same thing in the catalogue. */
const SIZE_SYNONYMS: Record<string, string[]> = { "Free Size": ["Free Size", "One Size"] };

const FILLER_WORDS = new Set(["with", "in", "and", "for", "of", "the", "a", "an", "color", "colour", "colored", "coloured", "size", "sized", "fit", "fabric", "type", "made", "material"]);

type Kind = "color" | "size" | "fabric" | "fit";

interface Vocabulary {
  /** lowercase phrase → [kind, canonical value] */
  phrases: Map<string, [Kind, string]>;
  /** longest phrase length, in words */
  maxWords: number;
}

function buildVocabulary(extras: SearchVocabularyExtras): Vocabulary {
  const phrases = new Map<string, [Kind, string]>();
  const add = (phrase: string, kind: Kind, value: string) => {
    const key = phrase.trim().toLowerCase().replace(/\s+/g, " ");
    // First registration wins: the built-in dictionary takes precedence over extras.
    if (key && !phrases.has(key)) phrases.set(key, [kind, value]);
  };
  for (const [alias, size] of Object.entries(SIZE_ALIASES)) add(alias, "size", size);
  for (const color of COLORS) add(color, "color", color);
  for (const fabric of FABRICS) add(fabric, "fabric", fabric);
  for (const fit of FITS) add(fit, "fit", fit);
  for (const size of extras.sizes ?? []) add(size, "size", size);
  for (const fabric of extras.fabrics ?? []) add(fabric, "fabric", fabric.toLowerCase());
  for (const fit of extras.fits ?? []) add(fit, "fit", fit.toLowerCase());

  let maxWords = 1;
  for (const key of phrases.keys()) maxWords = Math.max(maxWords, key.split(" ").length);
  return { phrases, maxWords };
}

const DEFAULT_VOCABULARY = buildVocabulary({});

export function parseSearchQuery(query: string, extras?: SearchVocabularyExtras): ParsedSearchQuery {
  const vocabulary = extras ? buildVocabulary(extras) : DEFAULT_VOCABULARY;
  // Lowercase, keep letters/digits/hyphens (so "t-shirt" and "a-line" stay whole), everything else is a separator.
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .split(" ")
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 0);

  const found: Record<Kind, string[]> = { color: [], size: [], fabric: [], fit: [] };
  const keywords: string[] = [];

  let index = 0;
  while (index < tokens.length) {
    let matched = false;
    for (let words = Math.min(vocabulary.maxWords, tokens.length - index); words >= 1; words--) {
      const phrase = tokens.slice(index, index + words).join(" ");
      const hit = vocabulary.phrases.get(phrase);
      if (!hit) continue;
      const [kind, value] = hit;
      if (!found[kind].includes(value)) found[kind].push(value);
      index += words;
      matched = true;
      break;
    }
    if (matched) continue;
    const token = tokens[index]!;
    if (!FILLER_WORDS.has(token)) keywords.push(token);
    index += 1;
  }

  return { keywords: keywords.join(" "), colors: found.color, sizes: found.size, fabrics: found.fabric, fits: found.fit };
}

/** True when the query named at least one attribute. */
export function hasAttributes(parsed: ParsedSearchQuery): boolean {
  return parsed.colors.length + parsed.sizes.length + parsed.fabrics.length + parsed.fits.length > 0;
}

/**
 * What the repository actually matches, with synonyms expanded: colour /
 * fabric / fit are substring terms, sizes are exact (case-insensitive)
 * values. Kept here so the synonym tables live next to the dictionary.
 */
export interface SearchMatchTerms {
  /** Each keyword word, matched against the product name. */
  nameTerms: string[];
  colorTerms: string[];
  sizeValues: string[];
  fabricTerms: string[];
  fitTerms: string[];
}

export function toMatchTerms(parsed: ParsedSearchQuery): SearchMatchTerms {
  const unique = (values: string[]) => Array.from(new Set(values));
  return {
    nameTerms: parsed.keywords ? unique(parsed.keywords.split(" ")) : [],
    colorTerms: unique(parsed.colors.flatMap((color) => COLOR_SYNONYMS[color] ?? [color])),
    sizeValues: unique(parsed.sizes.flatMap((size) => SIZE_SYNONYMS[size] ?? [size])),
    fabricTerms: parsed.fabrics,
    fitTerms: parsed.fits,
  };
}
