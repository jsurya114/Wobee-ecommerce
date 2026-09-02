import { describe, expect, it } from "vitest";
import { resolveUniqueSlug } from "./resolve-unique-slug";

describe("resolveUniqueSlug (categories)", () => {
  it("returns the plain slugified base when nothing collides", async () => {
    const slug = await resolveUniqueSlug("Winter Accessories", async () => false);
    expect(slug).toBe("winter-accessories");
  });

  it("appends -2 when the base slug is already taken", async () => {
    const taken = new Set(["winter-accessories"]);
    const slug = await resolveUniqueSlug("Winter Accessories", async (candidate) => taken.has(candidate));
    expect(slug).toBe("winter-accessories-2");
  });

  it("falls back to a generic 'category' base when the input has no sluggable characters", async () => {
    const slug = await resolveUniqueSlug("★★★", async () => false);
    expect(slug).toBe("category");
  });
});
