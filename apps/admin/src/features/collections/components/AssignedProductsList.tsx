"use client";

import { Button } from "@woobe/ui";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminProductDetail } from "@/features/products/api/admin-products.client";
import { ApiError } from "@/lib/api-client";

export function AssignedProductsList({
  products,
  onRemove,
  onReorder,
}: {
  products: AdminProductDetail[];
  onRemove: (productId: string) => Promise<void>;
  onReorder: (productIds: string[]) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (products.length === 0) {
    return <p className="font-body text-sm text-text-secondary">No products assigned yet.</p>;
  }

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= products.length) return;
    const reordered = [...products];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    await onReorder(reordered.map((p) => p.id));
  };

  const remove = async (productId: string) => {
    setBusyId(productId);
    try {
      await onRemove(productId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't remove that product.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="flex flex-col gap-2">
      {products.map((product, index) => (
        <li key={product.id} className="flex items-center justify-between gap-3 rounded-control border border-border p-2">
          <span className="truncate font-body text-sm text-text-primary">{product.name}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => void move(index, -1)}
              className="rounded-control p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={index === products.length - 1}
              onClick={() => void move(index, 1)}
              className="rounded-control p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <Button variant="secondary" size="sm" isLoading={busyId === product.id} onClick={() => void remove(product.id)}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
