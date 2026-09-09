"use client";

import { useState } from "react";
import { ApiError } from "./api-client";

export interface FormErrorState {
  /** Field name -> its own backend message, for wiring straight into that field's own `FormField error=` prop. */
  fieldErrors: Record<string, string>;
  /** A caught error with no specific field to attach to (a field-less 409/500/network failure) — shown once, not per-field. */
  formError: string | null;
}

/**
 * Shared error-state holder for every admin form (Product/Category/Collection/
 * Coupon/Banner/Variant/Settings — the manual-useState forms; the react-hook-form
 * ones use their own `setError` for the same field-level effect, see
 * `apply-backend-field-errors.ts`). Single responsibility: turn whatever a
 * mutation throws into per-field messages a form can hand straight to
 * `FormField`'s own `error` prop — never a toast for a validation problem the
 * admin can fix by looking at the field it's actually about.
 */
export function useFormError() {
  const [state, setState] = useState<FormErrorState>({ fieldErrors: {}, formError: null });

  /** Call from a form's own `catch` — parses a real `ApiError.fieldErrors` (400 Zod validation) into per-field messages; anything else (a field-less 404/409/500, or a non-ApiError) becomes the one `formError` instead, since there's no specific input to attach it to. */
  function handle(error: unknown, fallback = "That didn't work. Please try again."): void {
    if (error instanceof ApiError) {
      const entries = Object.entries(error.fieldErrors ?? {}).flatMap(([field, messages]) =>
        messages?.[0] ? ([[field, messages[0]]] as const) : [],
      );
      setState({
        fieldErrors: Object.fromEntries(entries),
        formError: entries.length === 0 ? error.message : null,
      });
    } else {
      setState({ fieldErrors: {}, formError: fallback });
    }
  }

  /** For a form's own client-side pre-submit checks (e.g. "choose a category") — same inline destination as a real backend field error, not a toast. */
  function setFieldError(field: string, message: string): void {
    setState((prev) => ({ fieldErrors: { ...prev.fieldErrors, [field]: message }, formError: null }));
  }

  function clear(): void {
    setState({ fieldErrors: {}, formError: null });
  }

  return { ...state, handle, setFieldError, clear };
}
