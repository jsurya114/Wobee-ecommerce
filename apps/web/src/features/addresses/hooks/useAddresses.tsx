"use client";

import type { CreateAddressInput, UpdateAddressInput } from "@woobe/validation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as addressesApi from "../api/addresses.client";
import type { Address } from "../api/addresses.client";

interface AddressesContextValue {
  addresses: Address[];
  isLoading: boolean;
  create: (input: CreateAddressInput) => Promise<Address>;
  update: (id: string, input: UpdateAddressInput) => Promise<Address>;
  remove: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AddressesContext = createContext<AddressesContextValue | null>(null);

/**
 * A real Context provider, not a bare hook each caller instantiates
 * independently — the address book page renders the list in one component
 * (AddressBookPageContent) while mutations happen in siblings/children
 * (AddressForm, AddressCard). A plain `useState`-per-call hook would give
 * each of those its own private copy of `addresses`, so a create/update/
 * delete in one component would never be visible in the list-rendering one
 * (caught live in the browser during Day 3 verification — the list stayed
 * on its empty state after a successful 201 create). Scoped to the address
 * book route only (not app-wide like CartProvider/WishlistProvider),
 * mounted by AddressBookPageContent itself, since nothing outside that page
 * needs the address list.
 */
export function AddressesProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (status !== "authenticated" || !accessToken) {
      setAddresses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await addressesApi.listAddresses(accessToken);
      setAddresses(result.addresses);
    } finally {
      setIsLoading(false);
    }
  }, [status, accessToken]);

  useEffect(() => {
    if (status === "loading") return;
    void load();
  }, [status, load]);

  const create = useCallback(
    async (input: CreateAddressInput) => {
      if (!accessToken) throw new Error("Log in to manage your addresses");
      const result = await addressesApi.createAddress(input, accessToken);
      await load();
      return result.address;
    },
    [accessToken, load],
  );

  const update = useCallback(
    async (id: string, input: UpdateAddressInput) => {
      if (!accessToken) throw new Error("Log in to manage your addresses");
      const result = await addressesApi.updateAddress(id, input, accessToken);
      await load();
      return result.address;
    },
    [accessToken, load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error("Log in to manage your addresses");
      await addressesApi.deleteAddress(id, accessToken);
      await load();
    },
    [accessToken, load],
  );

  const setDefault = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error("Log in to manage your addresses");
      await addressesApi.setDefaultAddress(id, accessToken);
      await load();
    },
    [accessToken, load],
  );

  return (
    <AddressesContext.Provider value={{ addresses, isLoading, create, update, remove, setDefault, refresh: load }}>
      {children}
    </AddressesContext.Provider>
  );
}

export function useAddresses(): AddressesContextValue {
  const ctx = useContext(AddressesContext);
  if (!ctx) {
    throw new Error("useAddresses must be used within <AddressesProvider>");
  }
  return ctx;
}

/**
 * Non-throwing variant for callers that may render outside `<AddressesProvider>`
 * — namely `AddressCard` when reused in checkout's `selectable` mode (Week 4
 * addition, `CheckoutAddressPicker`), which reads a caller-supplied address
 * list directly (checkout's own `listAddresses` call, see `CheckoutForm.tsx`)
 * and has nothing to mutate through this Context. Returns `null` instead of
 * throwing when there's no provider, rather than changing `useAddresses`
 * itself and risking masking a real "forgot to wrap in the provider" bug on
 * the address-book page.
 */
export function useAddressesOptional(): AddressesContextValue | null {
  return useContext(AddressesContext);
}
