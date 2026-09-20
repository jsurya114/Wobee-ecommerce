import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

/**
 * Client errors raised by Express's body parser must be 4xx, not 500: a 5xx
 * means "the server failed" to every dashboard, alert and on-call human.
 */
const app = createApp();

describe("errorHandler: body-parser client errors are 4xx, not 500", () => {
  it("malformed JSON -> 400 with a generic body (the parser's own message is not echoed)", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send('{"email": "a@b.com", oops');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "BAD_REQUEST", message: "Malformed request" } });
    expect(JSON.stringify(res.body)).not.toContain("oops");
  });

  it("a body over the size limit -> 413", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@b.com", padding: "x".repeat(300_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("an unsupported charset -> 4xx, never 500", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json; charset=utf-7").send("{}");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("a genuinely unexpected error is still a 500 with the generic body", async () => {
    const { errorHandler } = await import("./error-handler");
    let status = 0;
    let body: unknown;
    const res = { status(code: number) { status = code; return this; }, json(b: unknown) { body = b; return this; } };
    errorHandler(new Error("db exploded"), { id: "r1", path: "/x" } as never, res as never, () => undefined);
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  });

  it("a 4xx-looking error WITHOUT expose:true is not trusted (an internal bug that happens to carry a status stays a 500)", async () => {
    const { errorHandler } = await import("./error-handler");
    let status = 0;
    const res = { status(code: number) { status = code; return this; }, json() { return this; } };
    errorHandler(Object.assign(new Error("internal"), { status: 400 }), { id: "r1", path: "/x" } as never, res as never, () => undefined);
    expect(status).toBe(500);
  });
});
