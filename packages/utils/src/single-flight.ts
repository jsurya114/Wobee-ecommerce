/**
 * Wraps an async function so concurrent callers share ONE in-flight call:
 * while a call is pending, every further caller gets that same Promise;
 * once it settles (either way) the next caller starts a fresh one.
 *
 * Built for refresh-token rotation (2026-09-29): the refresh token is
 * single-use, and presenting an already-rotated one is treated by the API
 * as theft — every session for the user is revoked. Two parallel
 * `/refresh` calls from the same tab therefore log the user out
 * everywhere; routing all of them through one single-flight makes that
 * structurally impossible. apps/web's refresh-coordinator.ts is the same
 * idea written inline.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = fn().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}
