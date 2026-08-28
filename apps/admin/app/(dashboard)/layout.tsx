"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";

/** Mirrors apps/web's AccountView guard pattern exactly — redirect once the silent-refresh attempt settles, not before. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAdminAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <p className="p-8 text-center font-body text-text-secondary">Loading…</p>;
  }
  if (status === "unauthenticated") {
    return null; // redirect effect above is already firing
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      {/*
        No blanket overflow-x-hidden here (deliberately removed, Week 2 Day 4
        admin audit) — it silently CLIPPED a real overflow bug in
        OrderStatusActions instead of surfacing it as a scrollbar, which is
        how that bug went unnoticed by the scrollWidth/innerWidth check that
        caught every other page. Correctness belongs in each child
        (flex-wrap, truncate, overflow-x-auto on the sidebar/tables), not a
        wrapper that hides symptoms.

        `min-w-0` here is load-bearing, not decorative: as a flex item this
        column's default min-width is its content's intrinsic width, which
        overrides TopBar's own `truncate` further down the tree before
        truncation ever gets a chance to apply — found live at exactly
        768px with the longest role name ("product management staff"),
        which alone was enough to widen this column past the viewport by
        12px (a real horizontal scrollbar, not caught until re-checking
        this exact role/breakpoint pair after the OrderStatusActions fix).
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
