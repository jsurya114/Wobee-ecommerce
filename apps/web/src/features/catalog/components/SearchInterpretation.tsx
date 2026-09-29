import type { SearchInterpretation as Interpretation } from "../api/products.client";

/**
 * Smart search (2026-09-29) — one quiet line saying how the shop read the
 * query, e.g. "Searching kurti · Colour: rose · Size: S · Fit: relaxed".
 * Server-rendered text only (no client JS); shown only when the query named
 * an attribute, since a plain "kurti" search has nothing to explain.
 */
export function SearchInterpretation({ interpretation }: { interpretation?: Interpretation }) {
  if (!interpretation) return null;
  const parts = [
    interpretation.keywords ? `Searching ${interpretation.keywords}` : null,
    interpretation.colors.length ? `Colour: ${interpretation.colors.join(", ")}` : null,
    interpretation.sizes.length ? `Size: ${interpretation.sizes.join(", ")}` : null,
    interpretation.fabrics.length ? `Fabric: ${interpretation.fabrics.join(", ")}` : null,
    interpretation.fits.length ? `Fit: ${interpretation.fits.join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  return (
    <p className="mb-3 font-body text-xs text-text-secondary" aria-live="polite">
      {parts.join(" · ")}
      <span className="sr-only">. Best matches are shown first.</span>
    </p>
  );
}
