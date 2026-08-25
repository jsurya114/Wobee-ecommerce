"use client";

import Link from "next/link";
import { useAuth } from "../hooks/useAuth";

/**
 * Minimal nav for manual testing of the auth flow — NOT the real mobile
 * bottom nav from woobe_ui_design_plan.md §10 (Home/Search/Wishlist/Bag/
 * Account), which is Day 3+ scope once there's a cart/wishlist to link to.
 */
export function SiteHeader() {
  const { user, status, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="font-display text-xl text-primary">
        Woobe
      </Link>
      <nav className="flex items-center gap-4 font-body text-sm">
        {status === "loading" ? (
          <span className="text-text-secondary">…</span>
        ) : status === "authenticated" && user ? (
          <>
            <Link href="/account" className="text-text-primary hover:text-primary">
              {user.name}
            </Link>
            <button type="button" onClick={() => void logout()} className="text-text-secondary hover:text-primary">
              Log out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-text-primary hover:text-primary">
              Log in
            </Link>
            <Link href="/register" className="text-text-primary hover:text-primary">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
