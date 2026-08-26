"use client";

import { Button, Card } from "@woobe/ui";
import { ChevronRight, Package } from "lucide-react";
import Link from "next/link";
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
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-tint font-display text-xl text-primary">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-xl text-text-primary">{user.name}</h1>
          <p className="font-body text-sm text-text-secondary">{user.email}</p>
        </div>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div>
          <p className="font-body text-xs text-text-secondary">Name</p>
          <p className="font-body text-sm text-text-primary">{user.name}</p>
        </div>
        <div>
          <p className="font-body text-xs text-text-secondary">Email</p>
          <p className="font-body text-sm text-text-primary">{user.email}</p>
        </div>
        {user.phone ? (
          <div>
            <p className="font-body text-xs text-text-secondary">Phone</p>
            <p className="font-body text-sm text-text-primary">{user.phone}</p>
          </div>
        ) : null}
      </Card>

      <Link href="/account/orders">
        <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary">
          <Package className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="flex-1 font-body text-sm font-medium text-text-primary">My orders</span>
          <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        </Card>
      </Link>

      <Button variant="secondary" onClick={() => void logout()}>
        Log out
      </Button>
    </main>
  );
}
