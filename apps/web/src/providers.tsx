"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { GuestLoginPrompt } from "@/features/auth/components/GuestLoginPrompt";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { CartProvider } from "@/features/cart/hooks/useCart";
import { WishlistProvider } from "@/features/wishlist/hooks/useWishlist";

/** Client-side providers, kept out of the (server) root layout so layout.tsx stays a Server Component. CartProvider/WishlistProvider are inside AuthProvider — both read useAuth() (CartProvider to merge the guest cart on login, ADR-011; WishlistProvider because every wishlist endpoint requires login). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          {children}
          <GuestLoginPrompt />
          <Toaster position="top-center" richColors />
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );
}
