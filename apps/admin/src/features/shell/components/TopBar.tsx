"use client";

import { Button } from "@woobe/ui";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";

export function TopBar() {
  const { user, logout } = useAdminAuth();
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <span className="font-display text-lg text-text-primary">Woobe Admin</span>
      <div className="flex items-center gap-3">
        <span className="font-body text-sm text-text-secondary">
          {user?.name} · {user?.role.replace(/_/g, " ").toLowerCase()}
        </span>
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </header>
  );
}
