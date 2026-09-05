"use client";

import { Button, Sheet } from "@woobe/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import type { Address } from "@/features/addresses/api/addresses.client";

/**
 * Checkout's saved-address picker (Week 4 addition, on top of Week 3 Day 2's
 * "fetch saved addresses, auto-select default" wiring in `CheckoutForm.tsx`).
 * Only rendered by `CheckoutForm` when `savedAddresses.length > 0` — a guest
 * or an authenticated shopper with zero saved addresses never sees this
 * component at all, so their checkout form is unchanged.
 *
 * Reuses `AddressCard` (the address-book page's own display component,
 * extended with an optional `selectable`/`selected`/`onSelect` prop trio)
 * rather than forking a second address-card implementation, and `Sheet`
 * (the same bottom-sheet primitive `SizeSelectorSheet` already uses for
 * cart's "Change size" flow) for the "Change address" surface, matching this
 * codebase's own established "Change X" pattern instead of introducing a new
 * modal primitive.
 *
 * This never changes what gets submitted: selecting a saved address or
 * choosing "Add a new address" both just populate the same editable
 * `address.*` fields `CheckoutForm` already renders below this component —
 * checkout still always sends a full address snapshot, never an address id.
 */
export function CheckoutAddressPicker({
  savedAddresses,
  selectedAddressId,
  onSelectSaved,
  onSelectNew,
}: {
  savedAddresses: Address[];
  selectedAddressId: string | "new";
  onSelectSaved: (address: Address) => void;
  onSelectNew: () => void;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const selected = savedAddresses.find((address) => address.id === selectedAddressId) ?? null;

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-body text-xs font-medium uppercase tracking-[0.06em] text-text-secondary">Delivery address</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsSheetOpen(true)}>
          Change address
        </Button>
      </div>

      {selected ? (
        <AddressCard address={selected} selectable selected />
      ) : (
        <div className="rounded-control border border-dashed border-border p-4">
          <p className="font-body text-sm text-text-secondary">Enter a new address below.</p>
          {savedAddresses.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="mt-2 font-body text-xs font-medium text-primary hover:underline"
            >
              Choose a saved address instead
            </button>
          ) : null}
        </div>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen} title="Choose delivery address">
        <div className="flex flex-col gap-3">
          {savedAddresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              selectable
              selected={address.id === selectedAddressId}
              onSelect={(picked) => {
                onSelectSaved(picked);
                setIsSheetOpen(false);
              }}
            />
          ))}
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => {
              onSelectNew();
              setIsSheetOpen(false);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a new address
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
