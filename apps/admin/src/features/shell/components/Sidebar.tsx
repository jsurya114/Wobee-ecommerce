"use client";

import { Badge } from "@woobe/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { navEntriesForRole } from "../nav-config";

export function Sidebar() {
  const { user } = useAdminAuth();
  const pathname = usePathname();
  const entries = navEntriesForRole(user?.role ?? "CUSTOMER");

  return (
    // Below `md:`, this is a horizontal scroll strip above the content
    // instead of a permanent side column — the desktop-only `w-56` fixed
    // sidebar had no responsive breakpoint at all (found checking the
    // admin side, Week 2 Day 4: real content was pushed off-screen at
    // 375px, requiring horizontal scroll to reach it). Same "same
    // controls, different chrome" approach the storefront's mobile filter
    // panel already uses, not a new nav pattern invented for this.
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-3 md:w-56 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:p-4">
      {entries.map((entry) => {
        const isActive = pathname.startsWith(entry.href);
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
              className="flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 font-body text-sm text-text-secondary opacity-50"
            >
              {entry.label}
              <Badge variant="neutral">Soon</Badge>
            </span>
          );
        }
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 font-body text-sm ${isActive ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-primary-tint/50"}`}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
