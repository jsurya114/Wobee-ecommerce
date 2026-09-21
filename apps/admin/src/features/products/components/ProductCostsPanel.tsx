"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaiseAsInr, paiseToRupees, rupeesToPaise } from "@woobe/utils";
import { Button, Card, Input, Label } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { hasPermission } from "@/features/shell/nav-config";
import { ApiError } from "@/lib/api-client";
import * as productsApi from "../api/admin-products.client";
import type { ProductCosts } from "../api/admin-products.client";

const rupeeText = (paise: number | null): string => (paise === null ? "" : String(paiseToRupees(paise)));

/** "" -> null (no cost configured); otherwise integer paise, or undefined when the text isn't a valid non-negative amount. */
function parseRupees(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return rupeesToPaise(value);
}

/**
 * Cost basis for business analytics (net profit, inventory at cost). Cost is
 * confidential, so this only renders for roles with the analytics permission
 * (super_admin) — the API enforces the same. WEIGHT_BASED products take a
 * cost per kg (unit cost = cost/kg × the variant's weight); FIXED products a
 * per-piece cost per variant. Saving never rewrites past orders: each order
 * item snapshots the cost at sale time.
 */
export function ProductCostsPanel({ productId }: { productId: string }) {
  const { user, withFreshToken } = useAdminAuth();
  const allowed = hasPermission(user?.role, "VIEW_ANALYTICS");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "product-costs", productId],
    queryFn: () => withFreshToken((token) => productsApi.getProductCosts(productId, token)).then((r) => r.costs),
    enabled: allowed,
  });

  if (!allowed) return null;
  if (query.isPending) return null;
  if (query.isError || !query.data) {
    return <p className="font-body text-sm text-error">Couldn&apos;t load the cost settings.</p>;
  }

  return (
    <CostsForm
      // Remount on a fresh server value so local edits can't go stale after a save.
      key={JSON.stringify([query.data.costPerKgPaise, query.data.variants.map((v) => v.costPricePaise)])}
      costs={query.data}
      onSave={async (payload) => {
        const result = await withFreshToken((token) => productsApi.setProductCosts(productId, payload, token));
        queryClient.setQueryData(["admin", "product-costs", productId], result.costs);
        // Profit / inventory-at-cost on the dashboard depend on these numbers.
        await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      }}
    />
  );
}

function CostsForm({ costs, onSave }: { costs: ProductCosts; onSave: (payload: productsApi.SetProductCostsPayload) => Promise<void> }) {
  const weightBased = costs.pricingMode === "WEIGHT_BASED";
  const [perKg, setPerKg] = useState(rupeeText(costs.costPerKgPaise));
  const [variantText, setVariantText] = useState<Record<string, string>>(() => Object.fromEntries(costs.variants.map((v) => [v.variantId, rupeeText(v.costPricePaise)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    let payload: productsApi.SetProductCostsPayload;
    if (weightBased) {
      const parsed = parseRupees(perKg);
      if (parsed === undefined) return setError("Enter a cost of 0 or more, or leave blank to clear it.");
      payload = { costPerKgPaise: parsed };
    } else {
      const variantCosts: { variantId: string; costPricePaise: number | null }[] = [];
      for (const v of costs.variants) {
        const parsed = parseRupees(variantText[v.variantId] ?? "");
        if (parsed === undefined) return setError(`Enter a valid cost for ${v.color} / ${v.size}.`);
        variantCosts.push({ variantId: v.variantId, costPricePaise: parsed });
      }
      payload = { variantCosts };
    }
    setSaving(true);
    try {
      await onSave(payload);
      toast.success("Cost saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work.");
    } finally {
      setSaving(false);
    }
  };

  const perKgPaise = parseRupees(perKg);

  return (
    <Card className="p-4">
      <h2 className="font-body text-sm font-medium text-text-primary">Cost (for profit &amp; inventory value)</h2>
      <p className="mb-3 mt-0.5 font-body text-xs text-text-secondary">
        Confidential — used only in the admin dashboard. Applies to future orders and current stock; past orders keep the cost they were sold at.
      </p>

      {weightBased ? (
        <div className="max-w-xs">
          <Label htmlFor="cost-per-kg">Cost per kg (₹)</Label>
          <Input id="cost-per-kg" type="number" inputMode="decimal" min={0} step="0.01" value={perKg} onChange={(e) => setPerKg(e.target.value)} placeholder="e.g. 800" />
          {typeof perKgPaise === "number" && costs.variants.length > 0 ? (
            <p className="mt-1.5 font-body text-xs text-text-secondary">
              A {costs.variants[0]!.weightGrams} g piece would cost {formatPaiseAsInr(Math.round((perKgPaise * costs.variants[0]!.weightGrams) / 1000))}.
            </p>
          ) : null}
        </div>
      ) : costs.variants.length === 0 ? (
        <p className="font-body text-sm text-text-secondary">Add a variant first, then set its cost.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs text-text-secondary">Fixed-price product — cost per piece for each variant (₹).</p>
          {costs.variants.map((v) => (
            <div key={v.variantId} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
              <Label htmlFor={`cost-${v.variantId}`} className="truncate font-normal">
                {v.color} · {v.size} <span className="text-text-secondary">· {v.sku}</span>
              </Label>
              <Input id={`cost-${v.variantId}`} type="number" inputMode="decimal" min={0} step="0.01" value={variantText[v.variantId] ?? ""} onChange={(e) => setVariantText((prev) => ({ ...prev, [v.variantId]: e.target.value }))} placeholder="not set" />
            </div>
          ))}
        </div>
      )}

      {error ? <p className="mt-2 font-body text-xs text-error">{error}</p> : null}
      <div className="mt-4">
        <Button size="sm" isLoading={saving} onClick={() => void submit()}>
          Save cost
        </Button>
      </div>
    </Card>
  );
}
