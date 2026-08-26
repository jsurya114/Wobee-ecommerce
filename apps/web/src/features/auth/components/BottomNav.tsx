"use client";

import { Badge } from "@woobe/ui";
import { Home, ShoppingBag, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import { MOBILE_BOTTOM_NAV_HEIGHT_REM } from "@/lib/layout-constants";

/**
 * Sticky mobile bottom nav (woobe_ui_design_plan.md §10) — honestly scoped
 * to 4 tabs, not the doc's full 5 (Search + Wishlist aren't built features
 * this week, so they don't get a tab). Fixes the cramped top-header nav
 * flagged in the Week 1 completion audit: SiteHeader now only carries the
 * logo + a cart shortcut, this carries the actual navigation on mobile.
 * `md:hidden` — desktop keeps SiteHeader's horizontal nav.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { status } = useAuth();
  const { cart } = useCart();

  const accountHref = status === "authenticated" ? "/account" : "/login";
  const itemCount = cart?.itemCount ?? 0;

  const items = [
    { href: "/", label: "Home", icon: Home, isActive: pathname === "/" },
    { href: "/products", label: "Shop", icon: Store, isActive: pathname.startsWith("/products") },
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
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{
        // border-box: padding eats into `height`, so grow the box by the
        // safe-area inset first, then carve that same amount back out as
        // padding — content area stays a constant MOBILE_BOTTOM_NAV_HEIGHT_REM
        // tall, and the total rendered height (what fixed siblings offset
        // against) is exactly what ABOVE_MOBILE_BOTTOM_NAV_STYLE expects.
        height: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.isActive ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 px-2 font-body text-[11px] transition-colors ${
              item.isActive ? "text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="relative">
              <Icon className="h-6 w-6" strokeWidth={item.isActive ? 2.25 : 1.75} aria-hidden="true" />
              {item.count ? (
                <Badge
                  variant="neutral"
                  className="absolute -right-2 -top-2 min-w-[1.1rem] justify-center bg-primary px-1 py-0 text-[10px] leading-4 text-white"
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
