"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Shared "Save Changes" success behavior for every admin entity-edit page
 * (Product/Category/Collection/Coupon/Banner Detail) — a mutation that
 * genuinely succeeds always ends the same way: a "Saved successfully"
 * toast, then a redirect to the entity's own listing route. The listing
 * page already reads live query data directly (no staged local state), so
 * the just-saved value is visible immediately on arrival — no manual
 * refresh, no extra invalidation needed here.
 *
 * On failure this does nothing beyond letting the rejection propagate:
 * `save` throwing means the toast/redirect below never run, so the
 * caller's own `*Form` stays on the edit page with its in-progress values
 * intact and its own existing error handling (field error / toast.error)
 * fires exactly as it did before this hook existed.
 */
export function useSaveAndRedirect(listingHref: string) {
  const router = useRouter();
  return async (save: () => Promise<void>) => {
    await save();
    toast.success("Saved successfully");
    router.push(listingHref);
  };
}
