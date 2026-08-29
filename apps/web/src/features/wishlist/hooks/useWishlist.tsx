"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as wishlistApi from "../api/wishlist.client";
import type { WishlistView } from "../api/wishlist.client";

interface WishlistContextValue {
  wishlist: WishlistView | null;
  isLoading: boolean;
  /** Derived from the whole-list fetch, not a per-product API call — cheap enough to check for every card on a PLP grid without N requests (PDP's dedicated GET /wishlist/state/:productId stays available server-side for a client that only needs one product). */
  isSaved: (productId: string) => boolean;
  addItem: (productId: string, variantId?: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  moveToCart: (itemId: string, quantity?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

/**
 * Mirrors CartProvider's shape (useCart.tsx) — every mutation refetches the
 * server's whole view rather than merging a client-guessed state, same
 * "server is the only source of truth" rule (DEVELOPMENT_RULES.md #1's
 * spirit extends to availability/status flags here, not just price).
 * Unauthenticated visitors get an always-empty wishlist — every endpoint
 * requires login (week2 (1).md §5), so there's nothing to fetch until then.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useAuth();
  const [wishlist, setWishlist] = useState<WishlistView | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (status !== "authenticated" || !accessToken) {
      setWishlist(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await wishlistApi.getWishlist(accessToken);
      setWishlist(result);
    } finally {
      setIsLoading(false);
    }
  }, [status, accessToken]);

  useEffect(() => {
    if (status === "loading") return; // wait for AuthProvider's silent-refresh to settle, same as CartProvider
    void load();
  }, [status, load]);

  const addItem = useCallback(
    async (productId: string, variantId?: string) => {
      if (!accessToken) throw new Error("Log in to save items to your wishlist");
      await wishlistApi.addWishlistItem({ productId, variantId }, accessToken);
      await load();
    },
    [accessToken, load],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!accessToken) throw new Error("Log in to manage your wishlist");
      await wishlistApi.removeWishlistItem(itemId, accessToken);
      await load();
    },
    [accessToken, load],
  );

  const moveToCart = useCallback(
    async (itemId: string, quantity = 1) => {
      if (!accessToken) throw new Error("Log in to manage your wishlist");
      await wishlistApi.moveWishlistItemToCart(itemId, quantity, accessToken);
      await load();
    },
    [accessToken, load],
  );

  const savedProductIds = useMemo(() => new Set(wishlist?.items.map((item) => item.productId) ?? []), [wishlist]);
  const isSaved = useCallback((productId: string) => savedProductIds.has(productId), [savedProductIds]);

  return (
    <WishlistContext.Provider value={{ wishlist, isLoading, isSaved, addItem, removeItem, moveToCart, refresh: load }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within <WishlistProvider>");
  }
  return ctx;
}
