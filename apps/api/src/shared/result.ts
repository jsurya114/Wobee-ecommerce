/**
 * Result<T, E> — use-cases return this instead of throwing for expected,
 * handleable failures (not found, validation, business-rule violations).
 * Unexpected failures (DB down, bug) still throw and are caught by the
 * central error-handler middleware.
 */
export type Result<T, E = Error> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
