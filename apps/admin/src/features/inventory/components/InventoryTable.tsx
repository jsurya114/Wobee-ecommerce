"use client";

import { Badge, Button, EmptyState, Input } from "@woobe/ui";
import { Package } from "lucide-react";
import { Fragment, useRef, useState } from "react";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) {
    return <EmptyState icon={<Package />} title="No variants found" description="Try a different search or filter." />;
  }

  const startAdjusting = (variantId: string) => {
    setAdjustingId(variantId);
    setDelta("");
    setReason("");
    // The "Adjust" button lives in this table's own rightmost, horizontally-scrolled
    // column — without resetting scroll, the expanded form below would open already
    // scrolled out of view on a narrow viewport. `position: sticky` can't fix this: it
    // doesn't work on a <td> inside a `border-collapse` table (confirmed live — the
    // "sticky" cell scrolled exactly like a non-sticky one), so this is a real reset,
    // not a CSS pin.
    scrollContainerRef.current?.scrollTo({ left: 0 });
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
    <div ref={scrollContainerRef} className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pr-4">
              Product
            </th>
            <th scope="col" className="py-2 pr-4">
              SKU
            </th>
            <th scope="col" className="py-2 pr-4">
              Available
            </th>
            <th scope="col" className="py-2 pr-4">
              Reserved
            </th>
            <th scope="col" className="py-2 pr-4">
              Sellable
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
            {/* Week 2 Day 9 (week2 (1).md §20) — this header was empty (no
                text, no scope): axe's own td-has-header rule flagged every
                row's "Adjust" cell as unassociated with any header. Visually
                still blank (an action-button column is self-evident to a
                sighted user), but `sr-only` gives it the real accessible
                name a screen reader user needs to know what that cell's
                button is for. */}
            <th scope="col" className="py-2 pr-4">
              <span className="sr-only">Actions</span>
            </th>
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
                    {/* This is the one row in this table with an active input, unlike every other read-only row — `max-w` (well under the table's own >=720px rendered width) is what actually forces `flex-wrap` to kick in at a narrow viewport; flex-wrap alone never sees this as constrained, since the table itself is always wide enough to fit everything on one line. `startAdjusting` resets the container's own scroll to 0 on open so this form doesn't appear off-screen if "Adjust" was clicked from a scrolled-right position — `position: sticky` was tried first and doesn't work here: it's a no-op on a <td> inside a `border-collapse` table (confirmed live), not a viable fix. */}
                    <td colSpan={7} className="p-3">
                      <div className="flex max-w-[320px] flex-wrap items-end gap-2 sm:max-w-none">
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
