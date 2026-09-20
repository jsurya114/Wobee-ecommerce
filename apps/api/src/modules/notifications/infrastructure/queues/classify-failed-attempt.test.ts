import { describe, expect, it } from "vitest";
import { classifyFailedAttempt } from "./classify-failed-attempt";

describe("classifyFailedAttempt", () => {
  it("is a retry while attempts remain", () => {
    expect(classifyFailedAttempt({ attemptsMade: 1, opts: { attempts: 3 } }, { name: "Error" })).toBe("retry");
    expect(classifyFailedAttempt({ attemptsMade: 2, opts: { attempts: 3 } }, { name: "Error" })).toBe("retry");
  });

  it("is terminal once the last allowed attempt fails", () => {
    expect(classifyFailedAttempt({ attemptsMade: 3, opts: { attempts: 3 } }, { name: "Error" })).toBe("attempts_exhausted");
  });

  it("treats a job with no `attempts` option as single-attempt (BullMQ default)", () => {
    expect(classifyFailedAttempt({ attemptsMade: 1, opts: {} }, { name: "Error" })).toBe("attempts_exhausted");
  });

  it("an UnrecoverableError is terminal immediately, even with attempts left", () => {
    expect(classifyFailedAttempt({ attemptsMade: 1, opts: { attempts: 3 } }, { name: "UnrecoverableError" })).toBe("unrecoverable");
  });
});
