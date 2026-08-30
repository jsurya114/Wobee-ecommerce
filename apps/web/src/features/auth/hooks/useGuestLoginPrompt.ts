"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DISMISS_KEY = "woobe.guestLoginPromptDismissed";

// Pages that are already about signing in / paying — a "please log in"
// modal on top of them is noise.
const SUPPRESSED_PATHS = new Set(["/login", "/register", "/checkout"]);

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Policy for the guest "log in to explore more" prompt (the view is
 * `GuestLoginPrompt`). Once a visitor has stayed unauthenticated for
 * `CHECK_INTERVAL_MS`, surface it — re-checking on that same interval, and
 * only while they remain a guest. Dismissal is remembered for the browser
 * session so it never nags.
 *
 * Cost: one 5-minute `setInterval`, armed only for guests and torn down the
 * moment they authenticate / dismiss / this unmounts. No network, no
 * per-render work.
 */
export function useGuestLoginPrompt(): { open: boolean; dismiss: () => void } {
  const { status } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "unauthenticated" || readDismissed()) {
      setOpen(false);
      return;
    }

    const id = window.setInterval(() => {
      if (readDismissed()) {
        window.clearInterval(id);
        return;
      }
      setOpen(true);
    }, CHECK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [status]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode / storage disabled — fine, it just won't persist.
    }
  }, []);

  return { open: open && !SUPPRESSED_PATHS.has(pathname), dismiss };
}
