"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
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
            Providers; apps/admin's never did). Same placement/props as apps/web's
            for consistency. */}
        <Toaster position="top-center" richColors />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
