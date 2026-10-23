import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requestOtp, verifyOtp } from "../services/auth.service";
import { requestOtpSchema, verifyOtpSchema } from "../validators/schemas";

const router = Router();

router.post("/request-otp", asyncHandler(async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed.", details: parsed.error.flatten() });
  await requestOtp(parsed.data.phone);
  return res.status(200).json({ message: "OTP generated. Check the backend server terminal." });
}));

router.post("/verify-otp", asyncHandler(async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed.", details: parsed.error.flatten() });
  const result = await verifyOtp(parsed.data.phone, parsed.data.otp);
  return res.status(200).json({ message: "Login successful.", ...result });
}));

export default router;
