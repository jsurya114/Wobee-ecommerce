"use client";

import { Button } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

/**
 * The Week 1 Day 2 protected-route proof: unreachable without a valid
 * session, restored automatically via the httpOnly refresh cookie on
 * reload — this is what "the cookie/JWT flow works in an actual browser"
 * means in practice.
 */
export function AccountView() {
  const router = useRouter();
  const { user, status, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <p className="px-6 py-12 text-center font-body text-text-secondary">Loading…</p>;
  }

  if (status === "unauthenticated" || !user) {
    return null; // redirect effect above is already firing
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-6 py-12">
      <h1 className="font-display text-2xl text-text-primary">My Account</h1>
      <dl className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <div>
          <dt className="font-body text-sm text-text-secondary">Name</dt>
          <dd className="font-body text-base text-text-primary">{user.name}</dd>
        </div>
        <div>
          <dt className="font-body text-sm text-text-secondary">Email</dt>
          <dd className="font-body text-base text-text-primary">{user.email}</dd>
        </div>
        {user.phone ? (
          <div>
            <dt className="font-body text-sm text-text-secondary">Phone</dt>
            <dd className="font-body text-base text-text-primary">{user.phone}</dd>
          </div>
        ) : null}
      </dl>
      <Button variant="secondary" onClick={() => void logout()}>
        Log out
      </Button>
    </main>
  );
}
