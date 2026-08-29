import type { ReactNode } from "react";
import { BottomNav } from "@/features/auth/components/BottomNav";
import { SiteHeader } from "@/features/auth/components/SiteHeader";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/*
        Skip link (Week 2 Day 9, week2 (1).md §20 — WCAG 2.4.1 "Bypass
        Blocks", Level A). Off-screen until keyboard-focused (`sr-only
        focus:not-sr-only`), so a keyboard/screen-reader user's very first
        Tab can jump straight past the header nav to page content instead
        of tabbing through every nav link on every single page load. Every
        page's own content wraps in this shared layout's `#main-content`
        div, so this one link covers the whole storefront rather than
        needing an id repeated on every page's own <main>.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:font-body focus:text-sm focus:font-medium focus:text-white focus:shadow-modal"
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* pb-20 reserves space for BottomNav's fixed height so it never covers page content (md:pb-0 — desktop has no bottom nav). */}
      <div id="main-content" className="pb-20 md:pb-0">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
