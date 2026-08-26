"use client";

import { Badge } from "@woobe/ui";
import { LogIn, LogOut, Package, ShoppingBag, Store, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/features/cart/hooks/useCart";
import { useAuth } from "../hooks/useAuth";

/**
 * Slim top bar — logo + a cart shortcut on mobile (real navigation lives in
 * BottomNav, `md:hidden`, per woobe_ui_design_plan.md §10); the full
 * horizontal nav reappears here at `md:` and up, where there's room for it
 * without cramming (the cramped-mobile-nav issue flagged in the Week 1
 * completion audit was this component trying to do both jobs at once).
 */
export function SiteHeader() {
  const { user, status, logout } = useAuth();
  const { cart } = useCart();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-xl text-primary">
          Woobe
        </Link>

        {/* Desktop nav — mirrors BottomNav's destinations (and its icon+label pattern) plus login/register/logout, which the bottom nav folds into its Account tab. */}
        <nav className="hidden items-center gap-6 font-body text-sm md:flex">
          <Link href="/products" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
            <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Shop
          </Link>
          <Link href="/cart" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
            <ShoppingBag className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Bag{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
          </Link>
          {status === "loading" ? (
            <span className="text-text-secondary">…</span>
          ) : status === "authenticated" && user ? (
            <>
              <Link href="/account" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
                <User className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {user.name}
              </Link>
              <Link href="/account/orders" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
                <Package className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                My orders
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex cursor-pointer items-center gap-1.5 text-text-secondary transition-colors hover:text-primary"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
                <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Log in
              </Link>
              <Link href="/register" className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary">
                <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Register
              </Link>
            </>
          )}
        </nav>

        {/* Mobile cart shortcut — the rest of the nav lives in BottomNav. */}
        <Link href="/cart" aria-label="Bag" className="relative flex h-11 w-11 items-center justify-center text-text-primary md:hidden">
          <ShoppingBag className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          {cart && cart.itemCount > 0 ? (
            <Badge
              variant="neutral"
              className="absolute right-1 top-1 min-w-[1.1rem] justify-center bg-primary px-1 py-0 text-[10px] leading-4 text-white"
            >
              {cart.itemCount > 9 ? "9+" : cart.itemCount}
            </Badge>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
