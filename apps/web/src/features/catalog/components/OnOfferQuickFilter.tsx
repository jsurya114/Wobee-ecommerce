import { cn } from "@woobe/ui";
import { Tag } from "lucide-react";
import Link from "next/link";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import { PLP_CONTROL_BUTTON_CLASS, PLP_CONTROL_INACTIVE_CLASS } from "../lib/filter-options";

/**
 * "On Offer" storefront filter (offer-discovery pass, 2026-09-15) — a plain
 * link toggle, same posture as `CategoryFilter`/`CollectionFilter`: works
 * without JS, every state is a real shareable/bookmarkable URL
 * (`?onOffer=true`), and back/forward/refresh are just normal navigation.
 * No sheet needed (unlike Size/Filters) — it's a single boolean, not a
 * multi-value facet, so one tap toggles it on the SAME `buildProductsHref`
 * every other control uses (dropping `page`, preserving every other active
 * filter).
 */
export function OnOfferQuickFilter({ currentParams }: { currentParams: ProductsQueryParams }) {
  const active = currentParams.onOffer === "true";
  return (
    <Link
      href={buildProductsHref({ ...currentParams, onOffer: active ? undefined : "true" })}
      aria-pressed={active}
      className={cn(PLP_CONTROL_BUTTON_CLASS, active ? "border-primary bg-primary text-white" : PLP_CONTROL_INACTIVE_CLASS)}
    >
      <Tag className="h-4 w-4" aria-hidden="true" />
      On Offer
    </Link>
  );
}
