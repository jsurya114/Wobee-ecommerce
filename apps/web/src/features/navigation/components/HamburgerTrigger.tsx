"use client";

import { cn } from "@woobe/ui";
import { Menu } from "lucide-react";
import { NAV_DRAWER_ID } from "../lib/constants";

export function HamburgerTrigger({ onClick, expanded, className }: { onClick: () => void; expanded: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      aria-expanded={expanded}
      aria-controls={NAV_DRAWER_ID}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
