"use client";

import { formatGrams, formatPaiseAsInrCompact } from "@woobe/utils";
import { PriceTag } from "@woobe/ui";
import { Minus, Plus, X } from "lucide-react";
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
    <div className="flex gap-4 border-b border-border py-4 last:border-b-0">
      <Link
        href={`/products/${line.productSlug}`}
        className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-control bg-surface-2 sm:w-24"
      >
        {line.image ? (
          <img src={line.image} alt={line.productName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/products/${line.productSlug}`} className="font-body text-sm font-medium text-text-primary hover:text-primary">
              {line.productName}
            </Link>
            <p className="font-body text-xs text-text-secondary">
              {line.color} · {line.size} · {formatGrams(line.weightGrams)} · {formatPaiseAsInrCompact(line.ratePerKgPaise)}/kg
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isUpdating}
            aria-label="Remove item"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!line.isAvailable ? (
          <p className="font-body text-xs text-error">
            {line.availableQuantity === 0 ? "Out of stock" : `Only ${line.availableQuantity} left — update quantity`}
          </p>
        ) : null}

        <div className="mt-1 flex items-end justify-between">
          <div className="flex items-center gap-1 rounded-pill border border-border">
            <button
              type="button"
              onClick={() => void changeQuantity(line.quantity - 1)}
              disabled={isUpdating || line.quantity <= 1}
              className="flex h-9 w-9 items-center justify-center text-text-primary transition-colors disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="w-5 text-center font-body text-sm text-text-primary">{line.quantity}</span>
            <button
              type="button"
              onClick={() => void changeQuantity(line.quantity + 1)}
              disabled={isUpdating || line.quantity >= line.availableQuantity}
              className="flex h-9 w-9 items-center justify-center text-text-primary transition-colors disabled:opacity-40"
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <PriceTag pricePaise={line.subtotalPaise} />
        </div>
      </div>
    </div>
  );
}
