import { nextSlugCandidate, slugify } from "@woobe/utils";

const MAX_SLUG_ATTEMPTS = 50;

/**
 * Turns a raw name (or admin-typed slug) into a canonical, guaranteed-unique
 * slug by probing `exists` with increasing numeric suffixes
 * (linen-blend-shirt, linen-blend-shirt-2, ...) — the server-side
 * canonicalization step that makes the client's live preview a preview
 * only, never the authoritative value (see CreateProductUseCase /
 * CreateCategoryUseCase, which pass their repository's own slug-existence
 * check as `exists`). Throws if the attempt budget is exhausted —
 * astronomically unlikely in practice (50 same-named records already
 * existing), surfaced as a real error rather than looping forever.
 */
export async function resolveUniqueSlug(rawInput: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  const slugified = slugify(rawInput);
  // A name with no Latin letters/digits (e.g. pure emoji/symbols) slugifies
  // to "" — write a generic base instead of an empty or leading-hyphen slug.
  const base = slugified.length > 0 ? slugified : "item";
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = nextSlugCandidate(base, attempt);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique slug for "${rawInput}" after ${MAX_SLUG_ATTEMPTS} attempts`);
}
