import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api-client";

/**
 * The react-hook-form counterpart to `useFormError` (used by the manual-
 * useState forms) — Login/NewStaff/ActivateStaff already show client-side
 * (zod) errors inline via `errors.x?.message`; this does the same for a
 * *backend* field error caught in the submit handler, via RHF's own
 * `setError`, instead of a toast. Returns `true` if it found at least one
 * field to attach a message to, so the caller knows whether it still needs
 * to show a fallback (toast/banner) for a genuinely field-less error.
 */
export function applyBackendFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError) || !error.fieldErrors) return false;
  let applied = false;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if (messages?.[0]) {
      setError(field as Path<T>, { type: "server", message: messages[0] });
      applied = true;
    }
  }
  return applied;
}
