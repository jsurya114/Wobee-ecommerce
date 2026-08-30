"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the sheet header and used as the accessible dialog name. */
  title: ReactNode;
  children: ReactNode;
  /** Optional sticky footer (e.g. Clear / Apply). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Bottom sheet on Base UI's Dialog (redesign spec §K) — the mobile
 * filter/sort surface, later the size chart. `modal` is Base UI's default,
 * so focus is trapped, background scroll is locked, outside pointer events
 * are disabled, and focus returns to the trigger on close. `<Dialog.Close>`
 * lives inside the popup so touch screen readers can escape it.
 *
 * Slides up from the bottom edge; the transition is skipped under
 * `prefers-reduced-motion`.
 */
export function Sheet({ open, onOpenChange, title, children, footer, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-overlay transition-opacity duration-200 ease-out",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            "motion-reduce:transition-none",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-card bg-surface shadow-sheet",
            "transition-transform duration-300 ease-out",
            "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
            "motion-reduce:transition-none",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <Dialog.Title className="font-body text-sm font-semibold text-text-primary">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

          {footer ? (
            <div className="border-t border-border bg-surface px-5 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
