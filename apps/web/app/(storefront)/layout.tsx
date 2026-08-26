import type { ReactNode } from "react";
import { BottomNav } from "@/features/auth/components/BottomNav";
import { SiteHeader } from "@/features/auth/components/SiteHeader";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* pb-20 reserves space for BottomNav's fixed height so it never covers page content (md:pb-0 — desktop has no bottom nav). */}
      <div className="pb-20 md:pb-0">{children}</div>
      <BottomNav />
    </>
  );
}
