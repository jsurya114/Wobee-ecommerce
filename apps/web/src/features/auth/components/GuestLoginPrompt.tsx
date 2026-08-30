"use client";

import { buttonVariants } from "@woobe/ui";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useGuestLoginPrompt } from "../hooks/useGuestLoginPrompt";

/**
 * Guest "log in to explore more" modal. Mounted once, globally (in
 * `providers.tsx`). All the "when" logic lives in `useGuestLoginPrompt`;
 * this is only the view. Renders `null` until it's time, so it costs
 * nothing while hidden.
 */
export function GuestLoginPrompt() {
  const { open, dismiss } = useGuestLoginPrompt();
  const primaryRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-login-prompt-title"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />

      <div className="relative z-10 w-full max-w-sm rounded-card bg-surface p-6 text-center shadow-modal">
        <Sparkles
          className="mx-auto h-6 w-6 text-primary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <h2
          id="guest-login-prompt-title"
          className="mt-3 font-display text-xl text-text-primary"
        >
          Log in to explore more
        </h2>
        <p className="mt-2 font-body text-sm text-text-secondary">
          Save your favourites, track orders, and pick up right where you left
          off.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            ref={primaryRef}
            href="/login"
            onClick={dismiss}
            className={buttonVariants()}
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="font-body text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
