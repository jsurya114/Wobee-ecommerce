import { describe, expect, it } from "vitest";
import { resolveUniqueSku } from "./resolve-unique-sku";

describe("resolveUniqueSku", () => {
  it("returns the first generated candidate when nothing collides", async () => {
    const sku = await resolveUniqueSku(
      async () => false,
      () => "WOO-AAAAAAAA",
    );
    expect(sku).toBe("WOO-AAAAAAAA");
  });

  it("regenerates on collision until it finds a free one", async () => {
    const taken = new Set(["WOO-AAAAAAAA", "WOO-BBBBBBBB"]);
    let call = 0;
    const candidates = ["WOO-AAAAAAAA", "WOO-BBBBBBBB", "WOO-CCCCCCCC"];
    const sku = await resolveUniqueSku(
      async (candidate) => taken.has(candidate),
      () => candidates[call++]!,
    );
    expect(sku).toBe("WOO-CCCCCCCC");
  });

  it("throws after exhausting its attempt budget instead of looping forever", async () => {
    await expect(
      resolveUniqueSku(
        async () => true,
        () => "WOO-AAAAAAAA",
      ),
    ).rejects.toThrow(/unique SKU/i);
  });
});
