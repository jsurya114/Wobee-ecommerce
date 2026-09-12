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
import { useState } from "react";
import { HeaderSearch } from "@/features/catalog/components/HeaderSearch";
import { useCart } from "@/features/cart/hooks/useCart";
import { HamburgerTrigger } from "@/features/navigation/components/HamburgerTrigger";
import { NewArrivalsControl } from "@/features/navigation/components/NewArrivalsControl";
import { SiteNavDrawer } from "@/features/navigation/components/SiteNavDrawer";
import { useWishlist } from "@/features/wishlist/hooks/useWishlist";
import { useAuth } from "../hooks/useAuth";

// Global search belongs on the browsing surfaces only — home and the shop
// listing. Every other page (cart, checkout, account, auth, PDP …) has its
// own job; a header search there is noise.
const SEARCH_ROUTES = new Set(["/", "/products"]);

/**
 * Top bar (liquid-glass redesign 2026-09-03). Mobile: a centered "Woobe /
 * move freely" brand lockup — real navigation lives in the floating
 * BottomNav dock (`md:hidden`), and Bag already has a tab there too, so this
 * carries no nav/cart chrome of its own (no duplicate Bag action). Search on
 * mobile lives in its own row BELOW this header (`CompactSearchBar`,
 * rendered by the home/shop pages themselves) — deliberately never inside
 * this header, so it can never expand over and hide the centered logo the
 * old inline `HeaderSearch` risked. Desktop (`md:` and up) keeps the full
 * horizontal nav + inline `HeaderSearch`, unchanged — there's room for both
 * without cramming (the cramped-mobile-nav issue flagged in the Week 1
 * completion audit was this component trying to do every job on one row).
 *
 * Hamburger menu (2026-09-11): the two former `aria-hidden` mobile spacers
 * now hold the hamburger trigger (left) and the contextual `NewArrivalsControl`
 * (right) — discovery/help/about content that doesn't belong in BottomNav or
 * the desktop `<nav>` below, both of which stay untouched. The grid's two
 * outer columns are forced to an equal `minmax(0,1fr)` share regardless of
 * their content, which is what keeps the logo centered either way (a plain
 * flex row with unequal left/right content only gets it approximately
 * right). Desktop gets the same trigger + control, added to its existing
 * (non-centered) layout rather than a redesign.
 */
export function SiteHeader() {
  const { user, status, logout } = useAuth();
  const { cart } = useCart();
  const { wishlist } = useWishlist();
  const pathname = usePathname();
  const showSearch = SEARCH_ROUTES.has(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      {/* Mobile — guaranteed-centered logo lockup. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-2.5 md:hidden">
        <HamburgerTrigger onClick={() => setDrawerOpen(true)} expanded={drawerOpen} className="justify-self-start" />
        <Link href="/" className="flex flex-col items-center leading-none">
          <span className="font-display text-lg text-primary">Woobe</span>
          <span className="mt-0.5 font-body text-[10px] font-medium uppercase tracking-[0.16em] text-text-secondary">move freely</span>
        </Link>
        <NewArrivalsControl className="justify-self-end" />
      </div>

      {/* Desktop — unchanged full horizontal bar, plus the hamburger and the contextual New control. */}
      <div className="mx-auto hidden max-w-6xl items-center gap-3 px-6 py-2.5 md:flex md:gap-4 lg:gap-5">
        <HamburgerTrigger onClick={() => setDrawerOpen(true)} expanded={drawerOpen} className="shrink-0" />
        <Link href="/" className="shrink-0 font-display text-xl text-primary">
          Woobe
        </Link>

        {/* Right cluster — New control + search (route-gated) + nav, right-aligned as a group. */}
        <div className="flex flex-1 items-center gap-2 md:ml-auto md:flex-none md:gap-3 lg:gap-5">
          <NewArrivalsControl className="shrink-0" />
          {showSearch ? <HeaderSearch /> : null}

          {/*
            Nav — mirrors BottomNav's destinations (and its icon+label
            pattern) plus login/register/logout, which the bottom nav folds
            into its Account tab.

            Tablet width fix (2026-09-12): at `md` (768–1023px) this row was
            overflowing the viewport — confirmed live that even with the
            hamburger/New control removed entirely, a signed-in user's name
            alone already pushed it ~50px past 768px, and every extra nav
            item (Wishlist/My orders/Log out) compounds that. Each item's
            text label collapses to icon-only in that band (`aria-label`
            keeps the accessible name) and gaps tighten slightly; both
            restore at `lg:` (1024px+), unchanged from before. Icons, hrefs,
            and behavior are untouched — this is presentation-only.
          */}
          <nav className="flex shrink-0 items-center gap-3 lg:gap-6 font-body text-sm">
            <Link
              href="/"
              aria-label="Home"
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden lg:inline">Home</span>
            </Link>
            <Link
              href="/products"
              aria-label="Shop"
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <Store
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="hidden lg:inline">Shop</span>
            </Link>
            {/* Wishlist needs an account (no guest wishlist) — hidden until signed in so it isn't a dead-end for guests. */}
            {status === "authenticated" ? (
              <Link
                href="/wishlist"
                aria-label={`Wishlist${wishlist && wishlist.itemCount > 0 ? ` (${wishlist.itemCount})` : ""}`}
                className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
              >
                <Heart
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="hidden lg:inline">
                  Wishlist
                  {wishlist && wishlist.itemCount > 0
                    ? ` (${wishlist.itemCount})`
                    : ""}
                </span>
              </Link>
            ) : null}
            <Link
              href="/cart"
              aria-label={`Bag${cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}`}
              className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
            >
              <ShoppingBag
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="hidden lg:inline">
                Bag{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
              </span>
            </Link>
            {status === "loading" ? (
              <span className="text-text-secondary">…</span>
            ) : status === "authenticated" && user ? (
              <>
                <Link
                  href="/account"
                  aria-label={user.name}
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <User
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {/* `user.name` is the one string here of arbitrary, user-controlled length (everything else is a fixed short label) — truncated so an unusually long display name can't reopen the same overflow at `lg:` and up. */}
                  <span className="hidden max-w-32 truncate lg:inline">{user.name}</span>
                </Link>
                <Link
                  href="/account/orders"
                  aria-label="My orders"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <Package
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline">My orders</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  aria-label="Log out"
                  className="flex cursor-pointer items-center gap-1.5 text-text-secondary transition-colors hover:text-primary"
                >
                  <LogOut
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline">Log out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  aria-label="Log in"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <LogIn
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline">Log in</span>
                </Link>
                <Link
                  href="/register"
                  aria-label="Register"
                  className="flex items-center gap-1.5 text-text-primary transition-colors hover:text-primary"
                >
                  <UserPlus
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline">Register</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      <SiteNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </header>
  );
}
