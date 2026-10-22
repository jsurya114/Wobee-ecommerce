import { describe, expect, it } from "vitest";
import { paiseToRupeeInput, parseRupeeInputToPaise } from "./rupee-input";

describe("parseRupeeInputToPaise", () => {
  it("converts whole and fractional rupees to exact integer paise", () => {
    expect(parseRupeeInputToPaise("499")).toEqual({ ok: true, paise: 49_900 });
    expect(parseRupeeInputToPaise("499.5")).toEqual({ ok: true, paise: 49_950 });
    expect(parseRupeeInputToPaise(" 12.05 ")).toEqual({ ok: true, paise: 1_205 });
  });

  it("never picks up float error (0.29 * 100 === 28.999999999999996 in JS)", () => {
    expect(parseRupeeInputToPaise("0.29")).toEqual({ ok: true, paise: 29 });
    expect(parseRupeeInputToPaise("1.15")).toEqual({ ok: true, paise: 115 });
  });

  it("rejects more than 2 decimal places with the paise message", () => {
    expect(parseRupeeInputToPaise("12.345")).toEqual({ ok: false, error: "Price can have at most 2 decimal places (paise)." });
  });

  it("rejects negatives, non-numbers, exponents and blanks", () => {
    for (const input of ["-5", "abc", "1e3", "", "  ", "12.", ".5"]) {
      expect(parseRupeeInputToPaise(input).ok).toBe(false);
    }
  });

  it("rejects zero unless explicitly allowed", () => {
    expect(parseRupeeInputToPaise("0").ok).toBe(false);
    expect(parseRupeeInputToPaise("0.00", { allowZero: true })).toEqual({ ok: true, paise: 0 });
  });
});

describe("paiseToRupeeInput", () => {
  it("round-trips with the parser", () => {
    for (const paise of [0, 5, 29, 1_205, 49_900, 49_950]) {
      const parsed = parseRupeeInputToPaise(paiseToRupeeInput(paise), { allowZero: true });
      expect(parsed).toEqual({ ok: true, paise });
    }
  });

  it("drops .00 for whole rupees and pads single-digit paise", () => {
    expect(paiseToRupeeInput(120_000)).toBe("1200");
    expect(paiseToRupeeInput(1_205)).toBe("12.05");
  });
});
