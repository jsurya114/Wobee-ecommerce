import { generateSku } from "./generate-sku";

const MAX_SKU_ATTEMPTS = 5;

/**
 * Generates a fresh SKU and retries on a uniqueness collision (checked via
 * `exists`, the caller's repository lookup) — same collision-retry idiom as
 * `resolveUniqueSlug`, just with a random candidate instead of a
 * deterministic name-derived one, so a small attempt budget is enough (an
 * 8-hex-char random collision is vanishingly unlikely; 5 retries is a
 * generous margin, not a realistic requirement). `generate` is injectable
 * for tests; defaults to the real `generateSku`.
 */
export async function resolveUniqueSku(
  exists: (candidate: string) => Promise<boolean>,
  generate: () => string = generateSku,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const candidate = generate();
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique SKU after ${MAX_SKU_ATTEMPTS} attempts`);
}
