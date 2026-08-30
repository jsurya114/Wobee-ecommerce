"use client";

import { useRouter } from "next/navigation";
import {
  buildProductsHref,
  type ProductsQueryParams,
} from "../lib/build-products-href";
import { ProductSearchForm } from "./ProductSearchForm";

/**
 * PLP search (ADR-012) — wraps the shared `ProductSearchForm` with the
 * products-page context: a submit preserves every other active filter and
 * drops `page` (a new term invalidates whatever page number was valid for
 * the old result set). The form re-syncs its input from `currentParams.q`
 * whenever that changes for a reason other than this submit (e.g.
 * FiltersPanel's "Clear filters").
 */
export function SearchBar({
  currentParams,
}: {
  currentParams: ProductsQueryParams;
}) {
  const router = useRouter();

  return (
    <ProductSearchForm
      className="mb-4"
      initialQuery={currentParams.q ?? ""}
      onSubmit={(query) =>
        router.push(
          buildProductsHref({ ...currentParams, q: query || undefined }),
        )
      }
    />
  );
}
