import { formatGrams } from "@woobe/utils";
import { ProgressBar } from "@woobe/ui";
import { PackageCheck } from "lucide-react";
import type { CartView } from "../api/cart.client";
import { deriveWeightStatus } from "../lib/derive-weight-status";

/**
 * The two-stage weight-threshold indicator (woobe_ui_design_plan.md §8.2,
 * resolves ADR-021) — reads only the server-computed `cart.shipping`
 * values, never a client-side sum (ADR-011/ADR-021). Two stages, not one:
 * below the checkout minimum, the bar tracks toward it; between the
 * minimum and the free-delivery threshold, it tracks toward that instead.
 *
 * 2026-08-31: the "smart cart" weight incentive only applies to
 * weight-based (clothing) items — a cart of only fixed-price accessories
 * has nothing to show a weight progress bar for, so this renders nothing
 * rather than a permanently-stuck "add 1000g" prompt. `weightBasedTotalGrams`
 * (not `totalWeightGrams`) is what decides that — see compute-cart-totals.ts.
 */
export function WeightThresholdBanner({
  shipping,
  weightBasedTotalGrams,
}: {
  shipping: CartView["shipping"];
  weightBasedTotalGrams: number;
}) {
  const status = deriveWeightStatus(weightBasedTotalGrams, shipping);
  if (!status) {
    return null;
  }

  if (status.kind === "free-delivery") {
    return (
      <div className="flex items-center gap-2 rounded-control bg-success/10 p-3">
        <PackageCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="font-body text-xs font-medium text-success">Free delivery unlocked</p>
      </div>
    );
  }

  // Benefit-oriented wording (2026-09-03 refinement pass 2) — kept in sync
  // with FloatingCartWeightIndicator's own message; see its comment for why
  // the below-minimum case keeps its own phrasing instead of "free shipping".
  const message =
    status.kind === "below-minimum"
      ? `Add ${formatGrams(status.gramsRemaining)} more to checkout`
      : `Add ${formatGrams(status.gramsRemaining)} to unlock free shipping`;

  return (
    <div className="rounded-control bg-primary-tint/40 p-3">
      <p className="mb-1.5 font-body text-xs font-medium text-text-primary">{message}</p>
      <ProgressBar value={status.percent} />
    </div>
  );
}
