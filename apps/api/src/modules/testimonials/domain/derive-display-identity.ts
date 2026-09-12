/**
 * "First Name + Last Initial" public identity (2026-09-11 testimonial
 * design) — pure, dependency-free so it's unit-testable without a real
 * user row. `User.name` is a single free-text full-name field (no
 * separate firstName/lastName columns), so this splits on whitespace: the
 * first token is the first name, the last token's first character is the
 * last initial. A single-word name (no last name on file) degrades to
 * just the first name — never fabricates an initial that doesn't exist.
 */
export function deriveDisplayIdentity(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A Woobe Customer";
  if (parts.length === 1) return parts[0]!;
  const firstName = parts[0]!;
  const lastName = parts[parts.length - 1]!;
  return `${firstName} ${lastName[0]!.toUpperCase()}.`;
}
