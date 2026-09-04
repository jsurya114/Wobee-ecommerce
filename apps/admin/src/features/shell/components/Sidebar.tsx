"use client";

import { Badge, Button } from "@woobe/ui";
import {
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  RotateCcw,
  Settings,
  Shirt,
  ShoppingBag,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { navEntriesForRole } from "../nav-config";
import { BrandMark } from "./BrandMark";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/customers": Users,
  "/products": Shirt,
  "/categories": FolderTree,
  "/collections": LayoutGrid,
  "/banners": ImageIcon,
  "/coupons": Tag,
  "/orders": ShoppingBag,
  "/inventory": Package,
  "/staff": Users,
  "/returns": RotateCcw,
  "/settings": Settings,
};

export function Sidebar() {
  const { user, logout } = useAdminAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const entries = navEntriesForRole(user?.role ?? "CUSTOMER");

  // Collapse the mobile menu once a link has been followed.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    // Below `md:`, the nav collapses behind a hamburger toggle instead of a
    // horizontal scroll strip — the strip clipped its own tail off-screen at
    // 375px (visible in the screenshot: "Collections" cut mid-word). At `md:`
    // and up it's the permanent `w-56` side column, unchanged.
    <>
      <div className="flex items-center justify-between p-3 md:hidden">
        <BrandMark />
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen((v) => !v)}
          className="-mr-1 rounded-md p-2 text-text-primary hover:bg-primary-tint/50"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      <nav
        id="admin-nav"
        // Week 4 Day 1 fix (2026-09-04): this sits in normal document flow
        // beside <main> (see (dashboard)/layout.tsx), so without its own
        // sticky/scroll behavior it isn't actually "persistent" — it just
        // scrolls away with the page. Reproduced live: at a 1440x700 viewport
        // (a realistic laptop height once browser chrome is subtracted), the
        // nav's own 12-entry list is taller than the viewport, so "Log out"
        // renders below the fold with no way to reach it except scrolling the
        // whole page — which also scrolls the topbar out of view. `md:sticky
        // md:top-0 md:h-dvh md:overflow-y-auto` pins the column to the
        // viewport while <main> scrolls independently, and gives the nav list
        // itself an internal scrollbar if it's ever taller than the viewport,
        // so `md:mt-auto`'s bottom-pinned logout button stays reachable
        // either way.
        className={`${open ? "flex" : "hidden"} shrink-0 flex-col gap-1 p-3 md:flex md:sticky md:top-0 md:h-dvh md:w-56 md:overflow-y-auto md:border-r md:border-border md:p-4`}
      >
        {entries.map((entry) => {
          // Week 4 Day 1 fix (2026-09-04): plain `pathname.startsWith(entry.href)`
          // made Dashboard ("/") match every route — every path starts with "/" —
          // so it stayed highlighted alongside whatever page was actually open
          // (caught live: Products showed active with Dashboard still pink beside
          // it). "/" is the only entry this ambiguity applies to, so it alone
          // needs an exact match; every other entry's href is already a distinct
          // segment (e.g. "/products") where `startsWith` correctly also covers
          // its own nested routes (e.g. "/products/[id]").
          const isActive = entry.href === "/" ? pathname === "/" : pathname.startsWith(entry.href);
          const Icon = NAV_ICONS[entry.href];
          if (entry.status === "coming-soon") {
            return (
              // Week 2 Day 9 (week2 (1).md §20) — a Lighthouse audit flagged this
              // span's low contrast (opacity-50 text against the sidebar
              // background lands well under 4.5:1). Left as-is rather than
              // brightened: WCAG 1.4.3's own Understanding doc exempts inactive
              // UI components from the contrast requirement, and this genuinely
              // is one — a plain non-interactive <span>, no href/onClick, no
              // way to activate it. What the audit's automated check can't see
              // is that nothing here marks it as inactive for assistive tech,
              // so a screen-reader user got no such signal either — `aria-disabled`
              // is the real fix that gap needed, not fighting the muted styling.
              <span
                key={entry.href}
                aria-disabled="true"
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2 font-body text-sm text-text-secondary opacity-50"
              >
                <span className="flex items-center gap-2.5">
                  {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                  {entry.label}
                </span>
                <Badge variant="neutral">Soon</Badge>
              </span>
            );
          }
          return (
            <Link
              key={entry.href}
              href={entry.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 font-body text-sm transition-colors ${
                isActive
                  ? "bg-primary-tint font-medium text-primary"
                  : "text-text-primary hover:bg-primary-tint/50"
              }`}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {entry.label}
            </Link>
          );
        })}
        {/* `md:mt-auto` sinks it to the bottom of the sidebar column on desktop;
            on mobile it just follows the last link. */}
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 flex items-center gap-2 md:mt-auto md:w-full"
          onClick={() => void logout()}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </Button>
      </nav>
    </>
  );
}
