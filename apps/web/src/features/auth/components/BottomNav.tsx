"use client";

import { Badge, cn } from "@woobe/ui";
import { Heart, Home, ShoppingBag, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import { useWishlist } from "@/features/wishlist/hooks/useWishlist";
import { BOTTOM_NAV_DOCK_HEIGHT_REM, BOTTOM_NAV_FLOAT_GAP_REM } from "@/lib/layout-constants";
import { LIQUID_GLASS_RADIUS_CLASS, LIQUID_GLASS_SURFACE_CLASS } from "@/lib/liquid-glass";

/**
 * Floating liquid-glass mobile bottom nav (woobe_ui_design_plan.md §10;
 * glass surface rebuilt 2026-09-21). Tabs: Home, Shop, Wishlist (signed-in
 * only — there is no guest wishlist), Bag, Account. No global "Quick Add"
 * destination exists in the product (quick-add is a per-product-card
 * action), so the existing destinations are kept rather than inventing a
 * centre action that would change navigation. `md:hidden` — desktop keeps
 * SiteHeader's horizontal nav.
 *
 * The surface is a medium-radius rounded RECTANGLE (not a capsule), inset
 * 12px from each side and floating above the safe-area edge:
 *  - translucent white fill + `backdrop-blur` + `saturate` so page content
 *    genuinely shows through blurred (glass, not a white card);
 *  - a 1px white hairline border, plus an inset top highlight and a faint
 *    top-to-bottom sheen (`::before`) for depth;
 *  - one soft, low-opacity drop shadow to separate it from the page;
 *  - `@supports not (backdrop-filter)` falls back to a near-opaque white so
 *    icons/labels stay readable on browsers without blur.
 * The active tab gets a subtle tinted rounded-rect behind it plus a heavier
 * stroke — emphasised, not brightly filled.
 *
 * `BOTTOM_NAV_DOCK_HEIGHT_REM`/`_FLOAT_GAP_REM` (layout-constants.ts) are
 * this component's own two real numbers; every other fixed bottom-pinned
 * element (WhatsApp, PDP/cart docks, weight pill) derives its offset from
 * their sum (`MOBILE_BOTTOM_NAV_HEIGHT_REM`) rather than duplicating them.
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
      className={cn(
        "fixed inset-x-3 z-30 flex items-stretch gap-0.5 p-1.5 md:hidden",
        // The shared liquid-glass surface (lib/liquid-glass.ts) — also worn by the mobile search bar.
        LIQUID_GLASS_RADIUS_CLASS,
        LIQUID_GLASS_SURFACE_CLASS,
      )}
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
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 font-body text-[11px] font-medium leading-none transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              item.isActive ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="relative">
              <Icon className="h-[22px] w-[22px]" strokeWidth={item.isActive ? 2.1 : 1.6} aria-hidden="true" />
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
