import { describe, expect, it } from "vitest";
import {
  loginSchema,
  OTP_CODE_LENGTH,
  registerSchema,
  registerStartSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from "./auth.schema";

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

describe("registerStartSchema", () => {
  it("is the register payload shape (aliased, so it can't drift)", () => {
    expect(registerStartSchema).toBe(registerSchema);
  });
});

describe("verifyOtpSchema", () => {
  it("accepts an OTP_CODE_LENGTH-digit code and lowercases the email", () => {
    const result = verifyOtpSchema.safeParse({
      email: "Asha@Example.com",
      code: "1".repeat(OTP_CODE_LENGTH),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("asha@example.com");
  });

  it("rejects a code that isn't exactly OTP_CODE_LENGTH digits", () => {
    for (const code of ["1".repeat(OTP_CODE_LENGTH - 1), "1".repeat(OTP_CODE_LENGTH + 1), "12a4", ""]) {
      expect(verifyOtpSchema.safeParse({ email: "a@b.com", code }).success).toBe(false);
    }
  });

  it("rejects an invalid email", () => {
    expect(verifyOtpSchema.safeParse({ email: "not-an-email", code: "1234" }).success).toBe(false);
  });
});

describe("resendOtpSchema", () => {
  it("accepts an email and lowercases it", () => {
    const result = resendOtpSchema.safeParse({ email: "Asha@Example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("asha@example.com");
  });

  it("rejects a missing/invalid email", () => {
    expect(resendOtpSchema.safeParse({}).success).toBe(false);
    expect(resendOtpSchema.safeParse({ email: "x" }).success).toBe(false);
  });
});
