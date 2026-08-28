"use client";

import { Button } from "@woobe/ui";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";

export function TopBar() {
  const { user, logout } = useAdminAuth();
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      {/* Redundant with the sidebar strip/browser tab at narrow widths, and the two-line wrap it caused was the more visible problem (found checking the admin side, Week 2 Day 4) — hidden below `md:`, not removed. */}
      <span className="hidden font-display text-lg text-text-primary md:inline">Woobe Admin</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <span className="truncate font-body text-sm text-text-secondary">
          {user?.name} · {user?.role.replace(/_/g, " ").toLowerCase()}
        </span>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </header>
  );
}
