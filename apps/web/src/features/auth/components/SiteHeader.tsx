"use client";

import Link from "next/link";
import { useCart } from "@/features/cart/hooks/useCart";
import { useAuth } from "../hooks/useAuth";

/**
 * Minimal nav for manual testing — still not the real mobile bottom nav
 * from woobe_ui_design_plan.md §10 (Home/Search/Wishlist/Bag/Account),
 * which needs wishlist too (deferred to Week 2+ per
 * week1_excecution_prompt.md) to be worth building as a unit. Extended
 * here with Shop/Bag now that Day 3 gives them something real to link to.
 */
export function SiteHeader() {
  const { user, status, logout } = useAuth();
  const { cart } = useCart();

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="font-display text-xl text-primary">
        Woobe
      </Link>
      <nav className="flex items-center gap-4 font-body text-sm">
        <Link href="/products" className="text-text-primary hover:text-primary">
          Shop
        </Link>
        <Link href="/cart" className="text-text-primary hover:text-primary">
          Bag{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
        </Link>
        {status === "loading" ? (
          <span className="text-text-secondary">…</span>
        ) : status === "authenticated" && user ? (
          <>
            <Link href="/account" className="text-text-primary hover:text-primary">
              {user.name}
            </Link>
            <Link href="/account/orders" className="text-text-primary hover:text-primary">
              My orders
            </Link>
            <button type="button" onClick={() => void logout()} className="text-text-secondary hover:text-primary">
              Log out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-text-primary hover:text-primary">
              Log in
            </Link>
            <Link href="/register" className="text-text-primary hover:text-primary">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
