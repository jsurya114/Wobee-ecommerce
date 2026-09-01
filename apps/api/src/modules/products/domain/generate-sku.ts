import { randomBytes } from "node:crypto";

/**
 * `WOO-<8 uppercase hex>` — unique, stable, immutable, and carries no
 * business data (not derived from price, weight, display name, or
 * category — a pure random identifier). Collision handling is the calling
 * use-case's job (retry with a fresh candidate on a uniqueness conflict),
 * same idiom as `OrderNumberGeneratorService`.
 */
export function generateSku(): string {
  return `WOO-${randomBytes(4).toString("hex").toUpperCase()}`;
}
