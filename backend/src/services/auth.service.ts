import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

type OtpRecord = { hash: string; expiresAt: number; attempts: number };
const otpStore = new Map<string, OtpRecord>();

const normalizePhone = (phone: string) => phone.replace(/[\s()-]/g, "");

function hashOtp(phone: string, otp: string): string {
  return crypto.createHash("sha256").update(`${phone}:${otp}:${env.JWT_SECRET}`).digest("hex");
}

export async function requestOtp(phoneInput: string): Promise<void> {
  const phone = normalizePhone(phoneInput);
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  otpStore.set(phone, {
    hash: hashOtp(phone, otp),
    expiresAt: Date.now() + env.OTP_TTL_SECONDS * 1000,
    attempts: 0
  });

  // Assignment requirement: mock OTP is printed in the backend terminal only.
  console.info("\n========== MiniLedger Mock OTP ==========");
  console.info(`Phone: ${phone}`);
  console.info(`OTP: ${otp}`);
  console.info(`Expires in: ${env.OTP_TTL_SECONDS} seconds`);
  console.info("=========================================\n");
}

export async function verifyOtp(phoneInput: string, otp: string) {
  const phone = normalizePhone(phoneInput);
  const record = otpStore.get(phone);
  if (!record) throw new AppError(400, "No OTP requested for this phone number.", "OTP_NOT_REQUESTED");
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    throw new AppError(400, "OTP has expired. Please request a new one.", "OTP_EXPIRED");
  }
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    otpStore.delete(phone);
    throw new AppError(429, "Too many attempts. Please request a new OTP.", "OTP_ATTEMPTS_EXCEEDED");
  }

  const candidateHash = hashOtp(phone, otp);
  const matches = crypto.timingSafeEqual(Buffer.from(record.hash, "hex"), Buffer.from(candidateHash, "hex"));
  if (!matches) {
    record.attempts += 1;
    if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
      otpStore.delete(phone);
      throw new AppError(429, "Too many attempts. Please request a new OTP.", "OTP_ATTEMPTS_EXCEEDED");
    }
    throw new AppError(400, "Invalid OTP.", "INVALID_OTP");
  }

  let user;
  try {
    user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone }
    });
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error?.code === "P1001" ||
      error?.code === "P1002" ||
      error?.code === "P1017" ||
      error?.name === "PrismaClientInitializationError"
    ) {
      throw new AppError(503, "Database service unavailable. Please try again.", "DATABASE_UNAVAILABLE");
    }
    throw error;
  }

  // Database upsert succeeded; now consume the OTP (one-time use).
  otpStore.delete(phone);

  const token = jwt.sign({ sub: user.id, phone: user.phone }, env.JWT_SECRET, { expiresIn: "7d" });
  return { token, user: { id: user.id, phone: user.phone } };
}

export function _setOtpForTesting(phone: string, otp: string, ttlSeconds = 300) {
  const norm = normalizePhone(phone);
  otpStore.set(norm, {
    hash: hashOtp(norm, otp),
    expiresAt: Date.now() + ttlSeconds * 1000,
    attempts: 0
  });
}

export function _clearOtpStoreForTesting() {
  otpStore.clear();
}
