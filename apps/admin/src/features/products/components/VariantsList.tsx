"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Button } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { AdminProductVariant, UpdateVariantPayload, VariantPayload } from "../api/admin-products.client";
import { VariantForm } from "./VariantForm";

export function VariantsList({
  variants,
  onCreate,
  onUpdate,
  onSetActive,
}: {
  variants: AdminProductVariant[];
  onCreate: (input: VariantPayload) => Promise<void>;
  onUpdate: (variantId: string, input: UpdateVariantPayload) => Promise<void>;
  onSetActive: (variantId: string, isActive: boolean) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = async (variant: AdminProductVariant) => {
    setBusyId(variant.id);
    try {
      await onSetActive(variant.id, !variant.isActive);
      toast.success(variant.isActive ? "Variant deactivated" : "Variant activated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {variants.length === 0 ? <p className="font-body text-sm text-text-secondary">No variants yet.</p> : null}

      {variants.map((variant) =>
        editingId === variant.id ? (
          <VariantForm
            key={variant.id}
            variant={variant}
            onCancel={() => setEditingId(null)}
            onSubmit={async (input) => {
              await onUpdate(variant.id, input as UpdateVariantPayload);
              setEditingId(null);
            }}
          />
        ) : (
          <div key={variant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3">
            <div className="min-w-0">
              <p className="font-body text-sm font-medium text-text-primary">
                {variant.sku} — {variant.color} / {variant.size}
              </p>
              <p className="font-body text-xs text-text-secondary">
                {variant.weightGrams}g · {formatPaiseAsInr(variant.effectivePricePaiseCache)}
                {variant.fabric ? ` · ${variant.fabric}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant={variant.isActive ? "success" : "neutral"}>{variant.isActive ? "active" : "inactive"}</Badge>
              <Button variant="secondary" size="sm" onClick={() => setEditingId(variant.id)}>
                Edit
              </Button>
              <Button variant="secondary" size="sm" isLoading={busyId === variant.id} onClick={() => void toggleActive(variant)}>
                {variant.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <VariantForm
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            await onCreate(input as VariantPayload);
            setAdding(false);
          }}
        />
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} className="self-start">
          Add variant
        </Button>
      )}
    </div>
  );
}
