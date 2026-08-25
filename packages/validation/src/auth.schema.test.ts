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

  it("treats a blank phone field (what an untouched HTML input submits) as omitted, not invalid", () => {
    const result = registerSchema.safeParse({
      name: "Asha Rao",
      email: "asha@example.com",
      password: "Passw0rd",
      phone: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it("accepts a valid Indian phone number", () => {
    const result = registerSchema.safeParse({
      name: "Asha Rao",
      email: "asha@example.com",
      password: "Passw0rd",
      phone: "9876543210",
    });
    expect(result.success).toBe(true);
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
