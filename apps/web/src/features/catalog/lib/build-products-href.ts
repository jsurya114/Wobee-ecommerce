/**
 * Every filter control on /products (category pills, collection pills,
 * FiltersPanel) builds its link/navigation through this one function so
 * changing one filter always preserves every other active filter and
 * always drops `page` — landing back on page 1 is the only correct
 * behavior when the result set a page number was valid for has just
 * changed underneath it.
 */
export interface ProductsQueryParams {
  category?: string;
  collection?: string;
  q?: string;
  size?: string;
  color?: string;
  inStock?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
}

const PARAM_ORDER: (keyof ProductsQueryParams)[] = [
  "category",
  "collection",
  "q",
  "size",
  "color",
  "inStock",
  "minPrice",
  "maxPrice",
  "sort",
];

export function buildProductsHref(params: Partial<Record<keyof ProductsQueryParams, string | undefined>>): string {
  const searchParams = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = params[key];
    if (value) searchParams.set(key, value);
  }
  const qs = searchParams.toString();
  return qs ? `/products?${qs}` : "/products";
}

/**
 * The inverse direction — string URL params → the typed/array shape
 * `listProducts` accepts. One place for this parsing so the server page and
 * any client-side "preview this filter combination's result count" caller
 * (the filter sheets) agree on exactly how `size=M,L` / `minPrice` in rupees
 * vs. paise / etc. are read, instead of three near-identical copies drifting
 * apart.
 */
export function parseProductsQueryParams(params: ProductsQueryParams): {
  category?: string;
  collection?: string;
  q?: string;
  size?: string[];
  color?: string[];
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  // Loosely typed here (this module has no dependency on the catalog
  // feature's `ProductSort` union) — callers that feed this into
  // `listProducts` already receive validated values from the server page,
  // same as `ProductsQueryParams.sort` itself.
  sort?: string;
} {
  return {
    category: params.category,
    collection: params.collection,
    q: params.q,
    size: params.size ? params.size.split(",") : undefined,
    color: params.color ? params.color.split(",") : undefined,
    inStock: params.inStock === "true" ? true : undefined,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    sort: params.sort,
  };
}
