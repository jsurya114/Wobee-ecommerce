import { Button } from "@woobe/ui";
import Link from "next/link";

/**
 * The save/cancel row every admin entity form ends with (2026-09-29 admin UX
 * pass). Stays pinned to the bottom of the viewport while the form is taller
 * than the screen, so Save is always reachable without scrolling back down.
 *
 * Assumes the form is the last child of a `<Card className="p-4">` — the
 * negative margins stretch the bar to the card's edges. Cancel is a plain
 * link to the list: nothing unsaved is submitted, and a failed save never
 * navigates (the form's own error handling keeps the input on screen).
 */
export function FormActions({ isSubmitting, submitLabel, cancelHref }: { isSubmitting: boolean; submitLabel: string; cancelHref?: string }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-2 flex flex-wrap items-center gap-3 rounded-b-card border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
      <Button type="submit" isLoading={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
      {cancelHref ? (
        <Link href={cancelHref} className="font-body text-sm text-text-secondary hover:text-primary">
          Cancel
        </Link>
      ) : null}
    </div>
  );
}
