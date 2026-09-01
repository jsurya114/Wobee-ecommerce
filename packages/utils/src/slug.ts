const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RUN = /[^a-z0-9]+/g;
const LEADING_OR_TRAILING_HYPHENS = /^-+|-+$/g;

/**
 * Normalizes any input into a URL-safe kebab-case slug: lowercase, strips
 * diacritics, collapses anything that isn't [a-z0-9] into a single hyphen,
 * trims leading/trailing hyphens. Used both server-side (the authoritative
 * canonicalization + uniqueness check on product/category create) and
 * client-side (the live preview while an admin types a name) — same
 * function, so the preview never disagrees with what the server stores.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUN, "-")
    .replace(LEADING_OR_TRAILING_HYPHENS, "");
}

/** attempt 1 -> base, attempt 2 -> `${base}-2`, etc. — the server's collision-retry loop when a candidate slug is already taken (see CreateProductUseCase/CreateCategoryUseCase). */
export function nextSlugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}
