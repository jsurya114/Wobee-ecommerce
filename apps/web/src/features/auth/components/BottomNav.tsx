"use client";

import { Badge, cn } from "@woobe/ui";
import { Heart, Home, ShoppingBag, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import { useWishlist } from "@/features/wishlist/hooks/useWishlist";
import { BOTTOM_NAV_DOCK_HEIGHT_REM, BOTTOM_NAV_FLOAT_GAP_REM } from "@/lib/layout-constants";

/**
 * Floating liquid-glass mobile bottom nav (woobe_ui_design_plan.md §10;
 * liquid-glass redesign 2026-09-03) — 5 tabs now that Wishlist is a real
 * feature (Week 2 Day 2; Search still isn't, so it stays a 5th-slot gap
 * rather than forcing a 6th tab — search lives inline on /products
 * instead). Fixes the cramped top-header nav flagged in the Week 1
 * completion audit: SiteHeader now only carries the logo + motto, this
 * carries the actual navigation on mobile. `md:hidden` — desktop keeps
 * SiteHeader's horizontal nav.
 *
 * Floats as a rounded, translucent capsule inset from the edge rather than
 * a flush full-width bar — `BOTTOM_NAV_DOCK_HEIGHT_REM`/`_FLOAT_GAP_REM`
 * (layout-constants.ts) are this component's own two real numbers; every
 * other fixed bottom-pinned element derives its offset from their sum
 * (`MOBILE_BOTTOM_NAV_HEIGHT_REM`) rather than duplicating them.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { status } = useAuth();
  const { cart } = useCart();
  const { wishlist } = useWishlist();

  const accountHref = status === "authenticated" ? "/account" : "/login";
  const itemCount = cart?.itemCount ?? 0;
  const wishlistCount = wishlist?.itemCount ?? 0;

  const items = [
    { href: "/", label: "Home", icon: Home, isActive: pathname === "/" },
    { href: "/products", label: "Shop", icon: Store, isActive: pathname.startsWith("/products") },
    // Wishlist needs an account (no guest wishlist) — dropped from the bar for guests (4 tabs) so it isn't a dead-end.
    ...(status === "authenticated"
      ? [{ href: "/wishlist", label: "Wishlist", icon: Heart, isActive: pathname === "/wishlist", count: wishlistCount }]
      : []),
    { href: "/cart", label: "Bag", icon: ShoppingBag, isActive: pathname === "/cart", count: itemCount },
    {
      href: accountHref,
      label: "Account",
      icon: User,
      isActive: pathname.startsWith("/account") || pathname === "/login" || pathname === "/register",
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 z-30 flex items-center rounded-pill border border-white/60 bg-surface/75 shadow-modal backdrop-blur-xl md:hidden"
      style={{
        // The dock's own two real numbers (layout-constants.ts) — every other
        // fixed bottom-pinned element derives its offset from their sum
        // instead of duplicating either one.
        height: BOTTOM_NAV_DOCK_HEIGHT_REM,
        bottom: `calc(env(safe-area-inset-bottom) + ${BOTTOM_NAV_FLOAT_GAP_REM})`,
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-pill py-1.5 font-body text-[10px] font-medium transition-colors",
              item.isActive ? "text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={item.isActive ? 2.25 : 1.75} aria-hidden="true" />
              {item.count ? (
                <Badge
                  variant="neutral"
                  className="absolute -right-2 -top-1.5 min-w-[1.1rem] justify-center bg-primary px-1 py-0 text-[10px] leading-4 text-white"
                >
                  {item.count > 9 ? "9+" : item.count}
                </Badge>
              ) : null}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
