import type { ReactNode } from "react";

/** One labeled group in the drawer (Shop / Help & Support / About Woobe) — the `<h2>` gives each group a real, screen-reader-visible heading rather than a purely visual label. */
export function NavSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <h2 className="px-2 pb-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">{heading}</h2>
      {children}
    </div>
  );
}
