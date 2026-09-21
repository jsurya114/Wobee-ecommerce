import { Card, cn } from "@woobe/ui";
import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

/** One dashboard section: a card with a compact uppercase title, optional definition tooltip and a trailing action. */
export function Panel({
  title,
  info,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  info?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card flat className={cn("min-w-0 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 font-body text-label font-semibold uppercase tracking-[0.07em] text-text-secondary">
          {title}
          {info ? <InfoTip label={title}>{info}</InfoTip> : null}
        </h2>
        {action ? <div className="shrink-0 font-body text-xs font-medium text-primary">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

/** Empty / no-data state inside a panel — explains WHY there is nothing (per the brief: never a blank or broken chart). */
export function PanelEmpty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-1 rounded-control bg-surface-2/60 px-4 py-6 text-center">
      <p className="font-body text-sm font-medium text-text-primary">{title}</p>
      {hint ? <p className="max-w-sm font-body text-xs text-text-secondary">{hint}</p> : null}
      {action ? <div className="mt-1 font-body text-xs font-medium text-primary">{action}</div> : null}
    </div>
  );
}

/** A label/value pair used in the compact stat grids. */
export function Stat({
  label,
  value,
  hint,
  info,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  info?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 font-body text-xs text-text-secondary">
        <span className="truncate">{label}</span>
        {info ? <InfoTip label={label}>{info}</InfoTip> : null}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate font-display text-xl leading-tight",
          tone === "default" && "text-text-primary",
          tone === "good" && "text-success",
          tone === "warn" && "text-[#B45309]",
          tone === "bad" && "text-error",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 font-body text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}
