import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("unknown route", () => {
  it("returns a structured 404", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/v1/auth/register", () => {
  // Deliberately DB-independent — validates the middleware chain wiring
  // (route -> validate() -> controller) without touching Postgres. The real
  // register/login/refresh/logout flow is covered against the actual test
  // database in modules/auth/auth.integration.test.ts.
  it("rejects an invalid payload with 400 before reaching the controller", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
