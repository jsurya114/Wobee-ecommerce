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
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
