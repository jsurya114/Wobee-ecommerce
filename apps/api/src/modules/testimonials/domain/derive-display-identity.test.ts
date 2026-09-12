import { describe, expect, it } from "vitest";
import { deriveDisplayIdentity } from "./derive-display-identity";

describe("deriveDisplayIdentity", () => {
  it("returns First Name + Last Initial for a two-word name", () => {
    expect(deriveDisplayIdentity("Anjali Kumar")).toBe("Anjali K.");
  });

  it("uses only the first and last token for a three-or-more-word name", () => {
    expect(deriveDisplayIdentity("Anjali Priya Kumar")).toBe("Anjali K.");
  });

  it("returns just the name when there's no last name on file", () => {
    expect(deriveDisplayIdentity("Anjali")).toBe("Anjali");
  });

  it("collapses extra whitespace", () => {
    expect(deriveDisplayIdentity("  Anjali   Kumar  ")).toBe("Anjali K.");
  });

  it("falls back to a generic label for an empty name", () => {
    expect(deriveDisplayIdentity("")).toBe("A Woobe Customer");
  });
});
