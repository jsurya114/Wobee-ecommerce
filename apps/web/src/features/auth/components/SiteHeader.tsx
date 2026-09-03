"use client";

import {
  Heart,
  Home,
  LogIn,
  LogOut,
  Package,
  ShoppingBag,
  Store,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderSearch } from "@/features/catalog/components/HeaderSearch";
import { useCart } from "@/features/cart/hooks/useCart";
import { useWishlist } from "@/features/wishlist/hooks/useWishlist";
import { useAuth } from "../hooks/useAuth";

// Global search belongs on the browsing surfaces only — home and the shop
// listing. Every other page (cart, checkout, account, auth, PDP …) has its
// own job; a header search there is noise.
const SEARCH_ROUTES = new Set(["/", "/products"]);

/**
 * Top bar (liquid-glass redesign 2026-09-03). Mobile: a centered "Woobe /
 * move freely" brand lockup ONLY — real navigation lives in the floating
 * BottomNav dock (`md:hidden`), and Bag already has a tab there too, so this
 * carries no nav/cart chrome of its own (no duplicate Bag action). Search on
 * mobile lives in its own row BELOW this header (`CompactSearchBar`,
 * rendered by the home/shop pages themselves) — deliberately never inside
 * this header, so it can never expand over and hide the centered logo the
 * old inline `HeaderSearch` risked. Desktop (`md:` and up) keeps the full
 * horizontal nav + inline `HeaderSearch`, unchanged — there's room for both
 * without cramming (the cramped-mobile-nav issue flagged in the Week 1
 * completion audit was this component trying to do every job on one row).
 */
export function SiteHeader() {
  const { user, status, logout } = useAuth();
  const { cart } = useCart();
  const { wishlist } = useWishlist();
  const pathname = usePathname();
  const showSearch = SEARCH_ROUTES.has(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      {/* Mobile — guaranteed-centered logo lockup. The two outer grid
          columns are forced to an equal `minmax(0,1fr)` share regardless of
          their content, which is what actually guarantees the center column
          stays centered (a plain flex row with unequal left/right content
          only gets it approximately right). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-2.5 md:hidden">
        <span aria-hidden="true" />
        <Link href="/" className="flex flex-col items-center leading-none">
          <span className="font-display text-lg text-primary">Woobe</span>
          <span className="mt-0.5 font-body text-[10px] font-medium uppercase tracking-[0.16em] text-text-secondary">move freely</span>
        </Link>
        <span aria-hidden="true" />
      </div>

      {/* Desktop — unchanged full horizontal bar. */}
      <div className="mx-auto hidden max-w-6xl items-center gap-3 px-6 py-2.5 md:flex md:gap-5">
        <Link href="/" className="shrink-0 font-display text-xl text-primary">
          Woobe
        </Link>

        {/* Right cluster — search (route-gated) + nav, right-aligned as a group. */}
        <div className="flex flex-1 items-center gap-3 md:ml-auto md:flex-none md:gap-5">
          {showSearch ? <HeaderSearch /> : null}

          {/* Nav — mirrors BottomNav's destinations (and its icon+label pattern) plus login/register/logout, which the bottom nav folds into its Account tab. */}
          <nav className="flex shrink-0 items-center gap-6 font-body text-sm">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Home
            </Link>
            <Link
              href="/products"
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <Store
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Shop
            </Link>
            {/* Wishlist needs an account (no guest wishlist) — hidden until signed in so it isn't a dead-end for guests. */}
            {status === "authenticated" ? (
              <Link
                href="/wishlist"
                className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
              >
                <Heart
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Wishlist
                {wishlist && wishlist.itemCount > 0
                  ? ` (${wishlist.itemCount})`
                  : ""}
              </Link>
            ) : null}
            <Link
              href="/cart"
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <ShoppingBag
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Bag{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
            </Link>
            {status === "loading" ? (
              <span className="text-text-secondary">…</span>
            ) : status === "authenticated" && user ? (
              <>
                <Link
                  href="/account"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <User
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {user.name}
                </Link>
                <Link
                  href="/account/orders"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <Package
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  My orders
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex cursor-pointer items-center gap-1.5 text-text-secondary transition-colors hover:text-primary"
                >
                  <LogOut
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <LogIn
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <UserPlus
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
