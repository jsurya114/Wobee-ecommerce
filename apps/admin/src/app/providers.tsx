"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AdminAuthProvider } from "@/features/auth/hooks/useAdminAuth";
import { createAdminQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  // useState (not a module-level singleton) so each browser tab/SSR request gets its own
  // client — a module singleton would leak cached data across unrelated admin sessions.
  const [queryClient] = useState(createAdminQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>{children}</AdminAuthProvider>
    </QueryClientProvider>
  );
}
