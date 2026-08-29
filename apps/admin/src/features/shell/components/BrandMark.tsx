"use client";

import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";

/**
 * "Woobe Admin" wordmark, with a star badge appended when the signed-in
 * user is the SUPER_ADMIN. The star replaces the old "· super admin" role
 * text everywhere the shell showed it (TopBar on desktop, the hamburger
 * bar on mobile) — one glanceable mark for the one unique role, no text.
 */
export function BrandMark({ className }: { className?: string }) {
  const { user } = useAdminAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  return (
    <span className={`inline-flex items-center gap-1.5 font-display text-lg text-text-primary ${className ?? ""}`}>
      Woobe Admin
      {isSuperAdmin && (
        <span
          role="img"
          aria-label="Super admin"
          title="Super admin"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z" />
          </svg>
        </span>
      )}
    </span>
  );
}
