"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as cartApi from "../api/cart.client";
import type { CartView } from "../api/cart.client";

interface CartContextValue {
  cart: CartView | null;
  isLoading: boolean;
  addItem: (variantId: string, quantity: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  /** Requires a logged-in accessToken — throws if called while signed out (the coupon UI only renders the input for a logged-in customer). */
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Every mutation replaces `cart` with the server's response rather than
 * updating local state optimistically — the whole point of ADR-011 is that
 * price/subtotal/totals are server-computed, so the client never has a
 * legitimate independent copy to merge against.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useAuth();
  const [cart, setCart] = useState<CartView | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for AuthProvider's silent-refresh to settle before deciding
    // guest-cart vs. merge-into-account-cart — otherwise a returning logged
    // -in user would flash a guest cart first.
    if (status === "loading") return;

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        // Merging is idempotent (a no-op when there's no guest cart_id
        // cookie to merge), so calling it on every authenticated mount —
        // not just right after login — is safe and keeps this one path.
        const result = status === "authenticated" && accessToken ? await cartApi.mergeCart(accessToken) : await cartApi.getCart();
        if (!cancelled) setCart(result);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  const addItem = useCallback(
    async (variantId: string, quantity: number) => {
      const result = await cartApi.addCartItem({ variantId, quantity }, accessToken ?? undefined);
      setCart(result);
    },
    [accessToken],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      const result = await cartApi.updateCartItem(itemId, quantity, accessToken ?? undefined);
      setCart(result);
    },
    [accessToken],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const result = await cartApi.removeCartItem(itemId, accessToken ?? undefined);
      setCart(result);
    },
    [accessToken],
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      if (!accessToken) throw new Error("Log in to use a coupon");
      const result = await cartApi.applyCoupon(code, accessToken);
      setCart(result);
    },
    [accessToken],
  );

  const removeCoupon = useCallback(async () => {
    if (!accessToken) throw new Error("Log in to use a coupon");
    const result = await cartApi.removeCoupon(accessToken);
    setCart(result);
  }, [accessToken]);

  return (
    <CartContext.Provider value={{ cart, isLoading, addItem, updateItem, removeItem, applyCoupon, removeCoupon }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within <CartProvider>");
  }
  return ctx;
}
