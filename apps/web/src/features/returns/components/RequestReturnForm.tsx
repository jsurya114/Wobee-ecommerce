"use client";

import { Button, Textarea } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import type { OrderItemView } from "@/features/checkout/api/checkout.client";
import * as returnsApi from "../api/returns.client";

/**
 * week2 (1).md §11's customer-facing "Return request -> Reason" step.
 * Quantity pickers are capped at each item's own ordered quantity — not at
 * whatever's actually still returnable, since that would need fetching
 * every existing return's own line items just to compute here. The server
 * (resolveReturnEligibility) is the real, authoritative check regardless
 * (DEVELOPMENT_RULES.md #1's spirit): an over-claim attempt comes back as
 * a specific 422 message, not silently accepted.
 */
export function RequestReturnForm({ orderId, items, onRequested }: { orderId: string; items: OrderItemView[]; onRequested: () => void }) {
  const { accessToken } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedItems = items.filter((item) => (quantities[item.id] ?? 0) > 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    if (selectedItems.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Tell us why you're returning this");
      return;
    }

    setIsSubmitting(true);
    try {
      await returnsApi.requestReturn(
        {
          orderId,
          reason: reason.trim(),
          items: selectedItems.map((item) => ({ orderItemId: item.id, quantity: quantities[item.id]! })),
        },
        accessToken,
      );
      toast.success("Return request submitted");
      setQuantities({});
      setReason("");
      onRequested();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't submit that return request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-body text-sm text-text-primary">{item.productNameSnapshot}</p>
              <p className="font-body text-xs text-text-secondary">
                {item.color} · {item.size} · Qty {item.quantity}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2">
              <span className="font-body text-xs text-text-secondary">Return qty</span>
              <select
                aria-label={`Return quantity for ${item.productNameSnapshot}`}
                value={quantities[item.id] ?? 0}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                className="h-9 rounded-control border border-border bg-surface px-2 font-body text-sm text-text-primary"
              >
                {Array.from({ length: item.quantity + 1 }, (_, n) => n).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="return-reason">
          Reason
        </label>
        <Textarea id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you returning this?" />
      </div>

      <Button type="submit" isLoading={isSubmitting} disabled={selectedItems.length === 0} className="self-start">
        Submit return request
      </Button>
    </form>
  );
}
