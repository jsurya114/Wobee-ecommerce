"use client";

import { Button, Card, Spinner } from "@woobe/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AddressesProvider, useAddresses } from "../hooks/useAddresses";
import { AddressCard } from "./AddressCard";
import { AddressForm } from "./AddressForm";

export function AddressBookPageContent() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // redirect effect above is already firing
  }

  // AddressesProvider mounted here, not app-wide (unlike CartProvider/
  // WishlistProvider) — nothing outside this page needs the address list.
  // Both the list (below) and the add/edit forms (AddressCard, AddressForm)
  // read/write through this SAME provider instance, which is exactly the
  // point: a bare per-call hook here gave each of them its own private
  // state, so a create/update never showed up in the list — caught live
  // during Day 3 verification (see users.integration.test.ts era journal
  // entry for the browser repro).
  return (
    <AddressesProvider>
      <AddressBookContent />
    </AddressesProvider>
  );
}

function AddressBookContent() {
  const { addresses, isLoading } = useAddresses();
  const [isAdding, setIsAdding] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-xl text-text-primary">Your addresses</h1>

      {addresses.map((address) => (
        <AddressCard key={address.id} address={address} />
      ))}

      {isAdding ? (
        <Card className="p-5">
          <AddressForm isFirstAddress={addresses.length === 0} onDone={() => setIsAdding(false)} onCancel={() => setIsAdding(false)} />
        </Card>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a new address
        </Button>
      )}

      {addresses.length === 0 && !isAdding ? (
        <p className="text-center font-body text-sm text-text-secondary">You haven&apos;t saved any addresses yet.</p>
      ) : null}
    </main>
  );
}
