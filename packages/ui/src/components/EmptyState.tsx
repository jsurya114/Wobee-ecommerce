import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface EmptyStateProps {
  /** A lucide icon element, rendered ~40px, muted. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional call to action (a styled Link or Button). */
  action?: ReactNode;
  className?: string;
}

/**
 * One designed empty state for the whole storefront (redesign spec §K) —
 * empty cart / wishlist / no search results / no orders / unavailable
 * product. Replaces the ~5 hand-rolled icon+text+button blocks with a
 * single consistent treatment.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      {icon ? <div className="text-text-secondary [&>svg]:h-10 [&>svg]:w-10">{icon}</div> : null}
      <p className="font-body text-sm font-medium text-text-primary">{title}</p>
      {description ? <p className="max-w-xs font-body text-sm text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
