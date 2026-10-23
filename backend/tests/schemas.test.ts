import { describe, expect, it } from "vitest";
import { createLoanSchema, verifyOtpSchema } from "../src/validators/schemas";

describe("request validation", () => {
  it("accepts a valid loan", () => {
    expect(createLoanSchema.safeParse({
      friendName: "Rahul", amount: 2500, dueDate: "2026-10-30"
    }).success).toBe(true);
  });

  it("rejects a negative loan amount", () => {
    expect(createLoanSchema.safeParse({
      friendName: "Rahul", amount: -20, dueDate: "2026-10-30"
    }).success).toBe(false);
  });

  it("rejects an invalid calendar date", () => {
    expect(createLoanSchema.safeParse({
      friendName: "Rahul", amount: 20, dueDate: "2026-02-30"
    }).success).toBe(false);
  });

  it("requires a six digit OTP", () => {
    expect(verifyOtpSchema.safeParse({ phone: "+919876543210", otp: "123456" }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ phone: "+919876543210", otp: "123" }).success).toBe(false);
  });
});
