import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth.schema";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      name: "Asha Rao",
      email: "Asha@Example.com",
      password: "Passw0rd",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("asha@example.com"); // lowercased
    }
  });

  it("rejects a weak password", () => {
    const result = registerSchema.safeParse({
      name: "Asha Rao",
      email: "asha@example.com",
      password: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid Indian phone number when provided", () => {
    const result = registerSchema.safeParse({
      name: "Asha Rao",
      email: "asha@example.com",
      password: "Passw0rd",
      phone: "12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid login payload", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
