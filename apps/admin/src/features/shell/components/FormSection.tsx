import type { ReactNode } from "react";

/** A titled group of fields inside an admin form (2026-09-29 admin UX pass) — one visual language for "this block of fields belongs together". */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">{title}</h3>
        {description ? <p className="mt-1 font-body text-xs text-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
