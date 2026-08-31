import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SectionHeaderProps {
  /** The compact uppercase label — e.g. "New arrivals", "Shop by budget". */
  children: ReactNode;
  /** Optional right-aligned action, typically a "See all →" link. */
  action?: ReactNode;
  /** Heading level for the label. Defaults to h2. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/**
 * The one section header the storefront uses (redesign spec §K) — a
 * compact bold uppercase sans label with an optional trailing action.
 * Replaces the per-page `<h2 class="font-display text-2xl">` treatment so
 * product imagery, not typography, carries the page.
 */
export function SectionHeader({ children, action, as: Tag = "h2", className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-3", className)}>
      <Tag className="font-body text-label font-semibold uppercase tracking-[0.07em] text-text-secondary">{children}</Tag>
      {action ? <div className="shrink-0 font-body text-xs font-medium text-primary">{action}</div> : null}
    </div>
  );
}
