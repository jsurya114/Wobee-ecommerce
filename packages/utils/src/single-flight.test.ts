import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "./single-flight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("shares one in-flight call between concurrent callers", async () => {
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const run = singleFlight(fn);

    const calls = [run(), run(), run(), run(), run()];
    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve("token-2");
    await expect(Promise.all(calls)).resolves.toEqual(["token-2", "token-2", "token-2", "token-2", "token-2"]);
  });

  it("starts a fresh call once the previous one has settled", async () => {
    let n = 0;
    const run = singleFlight(async () => `token-${++n}`);
    await expect(run()).resolves.toBe("token-1");
    await expect(run()).resolves.toBe("token-2");
  });

  it("propagates a failure to every waiting caller, then allows a retry", async () => {
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const run = singleFlight(fn);

    const a = run();
    const b = run();
    d.reject(new Error("refresh failed"));
    await expect(a).rejects.toThrow("refresh failed");
    await expect(b).rejects.toThrow("refresh failed");

    fn.mockImplementationOnce(() => Promise.resolve("ok"));
    await expect(run()).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
