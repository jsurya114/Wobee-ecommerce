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
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-4">
      {entries.map((entry) => {
        const isActive = pathname.startsWith(entry.href);
        if (entry.status === "coming-soon") {
          return (
            <span
              key={entry.href}
              className="flex items-center justify-between rounded-md px-3 py-2 font-body text-sm text-text-secondary opacity-50"
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
            className={`rounded-md px-3 py-2 font-body text-sm ${isActive ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-primary-tint/50"}`}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
