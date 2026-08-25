"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { CartProvider } from "@/features/cart/hooks/useCart";

/** Client-side providers, kept out of the (server) root layout so layout.tsx stays a Server Component. CartProvider is inside AuthProvider — it reads useAuth() to merge the guest cart on login (ADR-011). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        {children}
        <Toaster position="top-center" richColors />
      </CartProvider>
    </AuthProvider>
  );
}
