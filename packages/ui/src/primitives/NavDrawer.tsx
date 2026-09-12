"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the drawer header and used as the accessible dialog name. */
  title: ReactNode;
  children: ReactNode;
  /** DOM id on the popup — lets a trigger button outside this component wire up `aria-controls`. */
  id?: string;
  className?: string;
}

/**
 * Left-anchored navigation drawer on Base UI's Dialog — sibling to `Sheet`
 * (which is hardcoded bottom-anchored and already has several live
 * consumers), not a variant of it, so this can't regress filters/checkout/
 * cart. Same primitives, same guarantees: `modal` is Base UI's default, so
 * focus is trapped, background scroll is locked, outside pointer events are
 * disabled, Escape and a backdrop click both dismiss, and focus returns to
 * the trigger on close.
 *
 * Slides in from the left edge; the transition is skipped under
 * `prefers-reduced-motion`.
 */
export function NavDrawer({ open, onOpenChange, title, children, id, className }: NavDrawerProps) {
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
          id={id}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-[85vw] max-w-xs flex-col bg-background shadow-modal",
            "transition-transform duration-300 ease-out",
            "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
            "motion-reduce:transition-none",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="font-display text-lg text-primary">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close menu"
              className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
