"use client";

import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAddresses } from "../hooks/useAddresses";
import type { Address } from "../api/addresses.client";
import { AddressForm } from "./AddressForm";

export function AddressCard({ address }: { address: Address }) {
  const { remove, setDefault } = useAddresses();
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
    setIsPending(true);
    try {
      await remove(address.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete this address");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSetDefault() {
    setIsPending(true);
    try {
      await setDefault(address.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't set this as default");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
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
    </Card>
  );
}
