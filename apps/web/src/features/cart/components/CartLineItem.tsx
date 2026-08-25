"use client";

import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "../hooks/useCart";
import type { CartLine } from "../api/cart.client";

export function CartLineItem({ line }: { line: CartLine }) {
  const { updateItem, removeItem } = useCart();
  const [isUpdating, setIsUpdating] = useState(false);

  async function changeQuantity(quantity: number) {
    if (quantity < 1) return;
    setIsUpdating(true);
    try {
      await updateItem(line.itemId, quantity);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update quantity");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleRemove() {
    setIsUpdating(true);
    try {
      await removeItem(line.itemId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this item");
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex gap-4 border-b border-border py-4">
      <Link href={`/products/${line.productSlug}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-control bg-surface">
        {line.image ? <img src={line.image} alt={line.productName} className="h-full w-full object-cover" /> : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/products/${line.productSlug}`} className="font-body text-sm font-medium text-text-primary hover:text-primary">
              {line.productName}
            </Link>
            <p className="font-body text-xs text-text-secondary">
              {line.color} · {line.size} · {formatGrams(line.weightGrams)}
            </p>
            <p className="font-body text-xs text-text-secondary">{formatPaiseAsInr(line.ratePerKgPaise)}/kg</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isUpdating}
            className="font-body text-xs text-text-secondary hover:text-error disabled:opacity-50"
          >
            Remove
          </button>
        </div>

        {!line.isAvailable ? (
          <p className="font-body text-xs text-error">
            {line.availableQuantity === 0 ? "Out of stock" : `Only ${line.availableQuantity} left — update quantity`}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void changeQuantity(line.quantity - 1)}
              disabled={isUpdating || line.quantity <= 1}
              className="h-8 w-8 rounded-control border border-border font-body text-sm text-text-primary disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-6 text-center font-body text-sm text-text-primary">{line.quantity}</span>
            <button
              type="button"
              onClick={() => void changeQuantity(line.quantity + 1)}
              disabled={isUpdating || line.quantity >= line.availableQuantity}
              className="h-8 w-8 rounded-control border border-border font-body text-sm text-text-primary disabled:opacity-40"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <p className="font-body text-sm font-medium text-text-primary">{formatPaiseAsInr(line.subtotalPaise)}</p>
        </div>
      </div>
    </div>
  );
}
