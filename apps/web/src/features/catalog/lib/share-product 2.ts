/**
 * Browser share mechanics, isolated from any component/UI concern (no toast,
 * no React) so `ShareProductButton` stays a thin presentational wrapper.
 * Native `navigator.share` (mobile's real share sheet) when available;
 * `navigator.clipboard` otherwise. Both APIs are optional/undefined in some
 * browsers, so every call is feature-detected rather than assumed.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareProduct(input: { url: string; title: string }): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, url: input.url });
      return "shared";
    } catch (error) {
      // The user backing out of the native share sheet throws AbortError —
      // that's a deliberate cancel, not a failure worth a fallback or a toast.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Anything else (e.g. a permissions-policy restriction) falls through
      // to the clipboard fallback below rather than dead-ending here.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(input.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
