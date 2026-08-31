"use client";

import { Badge } from "@woobe/ui";
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

// Global search belongs on the browsing surfaces only — home and the
// shop listing. Every other page (cart, checkout, account, auth, PDP …)
// has its own job; a header search there is noise.
const SEARCH_ROUTES = new Set(["/", "/products"]);

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
  const { wishlist } = useWishlist();
  const pathname = usePathname();
  const showSearch = SEARCH_ROUTES.has(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6 md:gap-5">
        <Link href="/" className="shrink-0 font-display text-lg text-primary sm:text-xl">
          Woobe
        </Link>

        {/* Right cluster — search (route-gated) + nav + mobile cart, right-aligned as a group. */}
        <div className="flex flex-1 items-center gap-3 md:ml-auto md:flex-none md:gap-5">
          {showSearch ? <HeaderSearch /> : null}

          {/* Desktop nav — mirrors BottomNav's destinations (and its icon+label pattern) plus login/register/logout, which the bottom nav folds into its Account tab. */}
          <nav className="hidden shrink-0 items-center gap-6 font-body text-sm md:flex">
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

          {/* Mobile cart shortcut — the rest of the nav lives in BottomNav. `ml-auto` keeps it at the right edge on pages with no header search. */}
          <Link
            href="/cart"
            aria-label="Bag"
            className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center text-text-primary md:ml-0 md:hidden"
          >
            <ShoppingBag
              className="h-6 w-6"
              strokeWidth={1.75}
              aria-hidden="true"
            />
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
      </div>
    </header>
  );
}
