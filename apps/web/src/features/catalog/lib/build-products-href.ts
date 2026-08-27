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
