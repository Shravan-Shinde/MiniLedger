import { z } from "zod";

export const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number (include country code when possible).");
export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must contain exactly 6 digits.")
});
export const createLoanSchema = z.object({
  friendName: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive().max(1_000_000_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD.")
}).refine((v) => {
  const date = new Date(`${v.dueDate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v.dueDate;
}, { message: "Due date is not a valid calendar date.", path: ["dueDate"] });
export const repaymentSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000)
});
