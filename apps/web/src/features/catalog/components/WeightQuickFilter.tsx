import { cn } from "@woobe/ui";
import { Scale } from "lucide-react";
import Link from "next/link";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import { PLP_CONTROL_BUTTON_CLASS, PLP_CONTROL_INACTIVE_CLASS } from "../lib/filter-options";

/**
 * "Fashion by Weight" filter (2026-09-29) — Woobe's own pricing mechanic, so
 * it leads the control bar. A plain server-rendered link toggle, same
 * posture as `OnOfferQuickFilter`: no client JS, every state a shareable URL
 * (`?pricingMode=WEIGHT_BASED`), and toggling keeps every other filter.
 */
export function WeightQuickFilter({ currentParams }: { currentParams: ProductsQueryParams }) {
  const active = currentParams.pricingMode === "WEIGHT_BASED";
  return (
    <Link
      href={buildProductsHref({ ...currentParams, pricingMode: active ? undefined : "WEIGHT_BASED" })}
      aria-pressed={active}
      className={cn(PLP_CONTROL_BUTTON_CLASS, active ? "border-primary bg-primary text-white" : PLP_CONTROL_INACTIVE_CLASS)}
    >
      <Scale className="h-4 w-4" aria-hidden="true" />
      Fashion by Weight
    </Link>
  );
}
