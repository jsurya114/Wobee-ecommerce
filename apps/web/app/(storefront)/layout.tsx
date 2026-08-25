import type { ReactNode } from "react";
import { SiteHeader } from "@/features/auth/components/SiteHeader";

// Real header/nav (mobile bottom nav per woobe_ui_design_plan.md §10) lands
// Day 3+ alongside cart/wishlist. SiteHeader here is a minimal stand-in
// scoped to Day 2's auth flow only.
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
