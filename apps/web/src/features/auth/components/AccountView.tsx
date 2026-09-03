"use client";

import { Button, Card } from "@woobe/ui";
import { ChevronRight, HelpCircle, Heart, LogOut, MapPin, Package, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType, type SVGProps } from "react";
import { useAuth } from "../hooks/useAuth";

/**
 * Compact grouped settings rows (UI/UX refinement pass, 2026-09-03) —
 * replaces the old one-card-per-row layout (each its own `<Card>` with its
 * own padding + a `gap-6` between them, needlessly tall) with a single
 * bordered list, divider-separated rows. "Help & Support" reuses the same
 * `mailto:` action `SiteFooter`'s "Contact us" link already uses — every
 * `href` here is a real, existing route/action, nothing invented.
 */
const ACCOUNT_LINKS: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/account/profile", label: "Edit profile", icon: Pencil },
  { href: "/account/addresses", label: "Your addresses", icon: MapPin },
  { href: "/account/orders", label: "My orders", icon: Package },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "mailto:hello@woobe.in", label: "Help & Support", icon: HelpCircle },
];

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
    <main className="mx-auto flex max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-tint font-display text-lg text-primary">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg text-text-primary">{user.name}</h1>
          <p className="truncate font-body text-xs text-text-secondary">{user.email}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Account</p>
        <Card className="divide-y divide-border overflow-hidden p-0">
          {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
              <Icon className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
              <span className="flex-1 font-body text-sm font-medium text-text-primary">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      </div>

      <Button variant="secondary" onClick={() => void logout()}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Log out
      </Button>
    </main>
  );
}
