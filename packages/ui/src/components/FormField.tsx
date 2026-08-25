import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { Input } from "../primitives/Input";
import { Label } from "../primitives/Label";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Domain-agnostic label+input+error composition — every form (auth, checkout, ...) builds on this instead of hand-rolling the same three elements. */
export function FormField({ label, error, id, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
