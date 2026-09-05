"use client";

import { Badge, Button, Card } from "@woobe/ui";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddressesOptional } from "../hooks/useAddresses";
import type { Address } from "../api/addresses.client";
import { AddressForm } from "./AddressForm";

export function AddressCard({
  address,
  selectable = false,
  selected = false,
  onSelect,
}: {
  address: Address;
  /**
   * Checkout's read-only picker mode (Week 4 addition — `CheckoutAddressPicker`
   * reuses this card instead of forking a second address-display component).
   * Hides the edit/set-default/delete actions (checkout renders this card
   * with no `<AddressesProvider>` above it, by design — see
   * `useAddresses.tsx`'s own doc comment on `useAddressesOptional`) and shows
   * a Select affordance instead. Optional and defaults to `false` so the
   * address-book page's own usage (which passes none of these props) is
   * completely unchanged.
   */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (address: Address) => void;
}) {
  const addressesCtx = useAddressesOptional();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);

  if (isEditing) {
    return (
      <Card className="p-5">
        <AddressForm existing={address} onDone={() => setIsEditing(false)} onCancel={() => setIsEditing(false)} />
      </Card>
    );
  }

  async function handleDelete() {
    if (!addressesCtx) return;
    setIsPending(true);
    try {
      await addressesCtx.remove(address.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete this address");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSetDefault() {
    if (!addressesCtx) return;
    setIsPending(true);
    try {
      await addressesCtx.setDefault(address.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't set this as default");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card
      className={`flex flex-col gap-3 p-5 ${selectable ? "cursor-pointer transition-colors" : ""} ${
        selectable && selected ? "border-primary bg-primary-tint/40" : ""
      }`}
      onClick={selectable ? () => onSelect?.(address) : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-body text-sm font-medium text-text-primary">{address.fullName}</p>
          <p className="font-body text-sm text-text-secondary">{address.phone}</p>
        </div>
        {address.isDefault ? <Badge variant="neutral">Default</Badge> : null}
      </div>
      <p className="font-body text-sm text-text-secondary">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
        <br />
        {address.city}, {address.state} {address.pincode}
      </p>
      {selectable ? (
        selected ? (
          <span className="flex items-center gap-1.5 font-body text-xs font-medium text-primary">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Selected
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(address);
            }}
          >
            Select
          </Button>
        )
      ) : (
        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditing(true)} disabled={isPending}>
            Edit
          </Button>
          {!address.isDefault ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleSetDefault()} disabled={isPending}>
              Set as default
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={isPending}
            className="text-error hover:bg-error/10 hover:text-error"
          >
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}
