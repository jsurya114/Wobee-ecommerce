"use client";

import { Badge, Button, Input } from "@woobe/ui";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { AdminInventoryRow } from "../api/admin-inventory.client";

/** DECISIONS_PENDING.md #6 — matches apps/api's own LOW_STOCK_THRESHOLD constant (inventory/domain/validate-inventory-adjustment.ts); duplicated here since apps/admin can't import apps/api's internals (ADR-019), same reasoning nav-config.ts's own ROLE_PERMISSIONS mirror already documents. */
const LOW_STOCK_THRESHOLD = 5;

export function InventoryTable({ items, onAdjust }: { items: AdminInventoryRow[]; onAdjust: (variantId: string, delta: number, reason: string) => Promise<void> }) {
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No variants match these filters.</p>;
  }

  const startAdjusting = (variantId: string) => {
    setAdjustingId(variantId);
    setDelta("");
    setReason("");
  };

  const submitAdjustment = async (variantId: string) => {
    const parsedDelta = Number(delta);
    if (!parsedDelta) {
      toast.error("Enter a non-zero adjustment");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("A reason is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await onAdjust(variantId, parsedDelta, reason.trim());
      toast.success("Inventory adjusted");
      setAdjustingId(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Product</th>
            <th className="py-2 pr-4">SKU</th>
            <th className="py-2 pr-4">Available</th>
            <th className="py-2 pr-4">Reserved</th>
            <th className="py-2 pr-4">Sellable</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const sellable = row.quantityAvailable - row.quantityReserved;
            const status = sellable <= 0 ? "out of stock" : sellable <= LOW_STOCK_THRESHOLD ? "low stock" : "in stock";
            const variant = row.color && row.size ? `${row.color} / ${row.size}` : "";
            return (
              <Fragment key={row.variantId}>
                <tr className="border-b border-border hover:bg-primary-tint/30">
                  <td className="py-3 pr-4 text-text-primary">
                    {row.productName}
                    {variant ? <div className="text-xs text-text-secondary">{variant}</div> : null}
                  </td>
                  <td className="py-3 pr-4 text-text-primary">{row.sku}</td>
                  <td className="py-3 pr-4 text-text-primary">{row.quantityAvailable}</td>
                  <td className="py-3 pr-4 text-text-primary">{row.quantityReserved}</td>
                  <td className="py-3 pr-4 text-text-primary">{sellable}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={status === "in stock" ? "success" : status === "low stock" ? "neutral" : "error"}>{status}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Button variant="secondary" size="sm" onClick={() => startAdjusting(row.variantId)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
                {adjustingId === row.variantId ? (
                  <tr className="border-b border-border bg-primary-tint/20">
                    <td colSpan={7} className="p-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="font-body text-xs text-text-secondary" htmlFor={`delta-${row.variantId}`}>
                            Adjustment (+/-)
                          </label>
                          <Input id={`delta-${row.variantId}`} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="h-9 w-28" />
                        </div>
                        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                          <label className="font-body text-xs text-text-secondary" htmlFor={`reason-${row.variantId}`}>
                            Reason
                          </label>
                          <Input id={`reason-${row.variantId}`} value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" />
                        </div>
                        <Button size="sm" isLoading={isSubmitting} onClick={() => void submitAdjustment(row.variantId)}>
                          Confirm
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setAdjustingId(null)} disabled={isSubmitting}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
