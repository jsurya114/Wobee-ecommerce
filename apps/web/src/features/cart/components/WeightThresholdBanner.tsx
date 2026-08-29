import { formatGrams } from "@woobe/utils";
import { ProgressBar } from "@woobe/ui";
import { PackageCheck } from "lucide-react";
import type { CartView } from "../api/cart.client";

/**
 * The two-stage weight-threshold indicator (woobe_ui_design_plan.md §8.2,
 * resolves ADR-021) — reads only the server-computed `cart.shipping`
 * values, never a client-side sum (ADR-011/ADR-021). Two stages, not one:
 * below the checkout minimum, the bar tracks toward it; between the
 * minimum and the free-delivery threshold, it tracks toward that instead.
 */
export function WeightThresholdBanner({ shipping, totalWeightGrams }: { shipping: CartView["shipping"]; totalWeightGrams: number }) {
  if (shipping.isFreeDelivery) {
    return (
      <div className="flex items-center gap-2 rounded-control bg-success/10 p-3">
        <PackageCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="font-body text-xs font-medium text-success">Free delivery unlocked</p>
      </div>
    );
  }

  if (!shipping.meetsMinimum) {
    const target = totalWeightGrams + shipping.gramsToMinimum;
    const percent = target > 0 ? (totalWeightGrams / target) * 100 : 0;
    return (
      <ProgressBar
        value={percent}
        label={`Add ${formatGrams(shipping.gramsToMinimum)} more to place your order`}
        className="rounded-control bg-primary-tint/40 p-3"
      />
    );
  }

  const target = totalWeightGrams + shipping.gramsToFreeDelivery;
  const percent = target > 0 ? (totalWeightGrams / target) * 100 : 0;
  return (
    <ProgressBar
      value={percent}
      label={`Add ${formatGrams(shipping.gramsToFreeDelivery)} more for free delivery`}
      className="rounded-control bg-primary-tint/40 p-3"
    />
  );
}
