"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/Button";

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" paints the confirm button red — for irreversible actions. */
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** While true the confirm button shows a spinner and the dialog can't be dismissed. */
  isLoading?: boolean;
}

/**
 * Modal "are you sure?" step (2026-09-28) on the native <dialog> element via
 * showModal(): the browser supplies the focus trap, inert background and
 * top-layer stacking. Escape (the dialog's own `cancel` event) and the Cancel
 * button call onCancel; the confirm button is focused on open, so Enter
 * confirms. Nothing can close it while `isLoading` — the caller closes it
 * once its action settles.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      confirmRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        // Escape key. Always prevent the browser's own close so `open` stays the single source of truth.
        e.preventDefault();
        if (!isLoading) onCancel();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-0 text-text-primary shadow-modal backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="font-display text-lg text-text-primary">
            {title}
          </h2>
          <div id={descriptionId} className="font-body text-sm text-text-secondary">
            {description}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            size="sm"
            isLoading={isLoading}
            onClick={() => void onConfirm()}
            className={cn(variant === "destructive" && "bg-error text-white hover:bg-error/90")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
