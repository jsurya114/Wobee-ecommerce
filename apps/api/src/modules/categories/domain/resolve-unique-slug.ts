import { nextSlugCandidate, slugify } from "@woobe/utils";

const MAX_SLUG_ATTEMPTS = 50;

/**
 * Same shape as products' own resolve-unique-slug.ts (kept as a per-module
 * copy rather than a cross-module import — ARCHITECTURE.md §3.1, each
 * module stays self-contained). Turns a raw name (or admin-typed slug) into
 * a canonical, guaranteed-unique slug by probing `exists` with increasing
 * numeric suffixes (tops, tops-2, ...).
 */
export async function resolveUniqueSlug(rawInput: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  const slugified = slugify(rawInput);
  const base = slugified.length > 0 ? slugified : "category";
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = nextSlugCandidate(base, attempt);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique slug for "${rawInput}" after ${MAX_SLUG_ATTEMPTS} attempts`);
}
