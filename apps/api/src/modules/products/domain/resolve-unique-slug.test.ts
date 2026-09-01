import { describe, expect, it } from "vitest";
import { resolveUniqueSlug } from "./resolve-unique-slug";

describe("resolveUniqueSlug", () => {
  it("returns the plain slugified base when nothing collides", async () => {
    const slug = await resolveUniqueSlug("Linen Blend Oversized Shirt", async () => false);
    expect(slug).toBe("linen-blend-oversized-shirt");
  });

  it("appends -2 when the base slug is already taken", async () => {
    const taken = new Set(["linen-blend-oversized-shirt"]);
    const slug = await resolveUniqueSlug("Linen Blend Oversized Shirt", async (candidate) => taken.has(candidate));
    expect(slug).toBe("linen-blend-oversized-shirt-2");
  });

  it("keeps incrementing past multiple existing collisions", async () => {
    const taken = new Set(["shirt", "shirt-2", "shirt-3"]);
    const slug = await resolveUniqueSlug("Shirt", async (candidate) => taken.has(candidate));
    expect(slug).toBe("shirt-4");
  });

  it("throws after exhausting its attempt budget instead of looping forever", async () => {
    await expect(resolveUniqueSlug("Shirt", async () => true)).rejects.toThrow(/unique slug/i);
  });

  it("falls back to a generic base when the input has no sluggable characters, instead of writing an empty/leading-hyphen slug", async () => {
    const slug = await resolveUniqueSlug("★★★", async () => false);
    expect(slug).toBe("item");
  });
});
