"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "@woobe/ui";
import { AdminAuthProvider } from "@/features/auth/hooks/useAdminAuth";
import { createAdminQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  // useState (not a module-level singleton) so each browser tab/SSR request gets its own
  // client — a module singleton would leak cached data across unrelated admin sessions.
  const [queryClient] = useState(createAdminQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        {children}
        {/* Every admin page has always called toast.success/toast.error (sonner) on
            every mutation — activate/deactivate, delete, inventory adjust, this
            session's own save-and-redirect flow — but this app never actually
            rendered sonner's own portal component anywhere, so none of those calls
            have ever been visible on screen (apps/web mounts it in its own
            Providers; apps/admin's never did). `@woobe/ui`'s `Toaster` is the same
            shared, Woobe-pink-themed instance apps/web renders (2026-09-12 toast
            theme-consistency fix) — mounting `sonner`'s own `<Toaster>` directly
            here again would silently reintroduce sonner's generic richColors
            palette for this app only. */}
        <Toaster />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
