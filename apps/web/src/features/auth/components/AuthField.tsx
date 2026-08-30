"use client";

import { Input, Label, cn } from "@woobe/ui";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  error?: string;
  /** Password field — adds a show/hide toggle and swaps the input type. */
  revealable?: boolean;
}

/**
 * Presentational only — a labelled `@woobe/ui` `Input` with a leading icon
 * and (for passwords) a reveal toggle. All form state still lives in the
 * parent's react-hook-form instance; this just forwards `register()`'s
 * props/ref through to the underlying input, same contract as `FormField`.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, icon: Icon, error, revealable, id, type = "text", className, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [revealed, setRevealed] = useState(false);
  const resolvedType = revealable ? (revealed ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <Input
          ref={ref}
          id={fieldId}
          type={resolvedType}
          invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn("pl-11", revealable && "pr-11", className)}
          {...inputProps}
        />
        {revealable ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {revealed ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
});
