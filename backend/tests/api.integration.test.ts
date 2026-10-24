import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";
import { env } from "../src/config/env";
import { _clearOtpStoreForTesting, _setOtpForTesting } from "../src/services/auth.service";

describe("MiniLedger API Integration Tests", () => {
  const testPhoneUser1 = "+919999900001";
  const testPhoneUser2 = "+919999900002";
  let tokenUser1: string;
  let tokenUser2: string;
  let userId1: string;
  let userId2: string;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      // Clean up test users if they exist
      await prisma.user.deleteMany({
        where: { phone: { in: [testPhoneUser1, testPhoneUser2] } }
      });
      dbAvailable = true;
    } catch {
      console.warn("⚠️ Live PostgreSQL server not reachable at localhost:5432. Live database integration tests will be skipped. Run 'npm run db:up' via Docker to run live integration tests.");
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      try {
        await prisma.user.deleteMany({
          where: { phone: { in: [testPhoneUser1, testPhoneUser2] } }
        });
        await prisma.$disconnect();
      } catch {
        // ignore disconnect errors on cleanup
      }
    }
  });

  beforeEach(() => {
    _clearOtpStoreForTesting();
  });

  describe("GET /api/health", () => {
    it("returns 200 with service status and database connectivity", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("miniledger-api");
      expect(res.body.database).toBe("connected");
      expect(res.body.timestamp).toBeDefined();
    });

    it("returns 503 degraded when database connection fails", async () => {
      const originalQueryRaw = prisma.$queryRaw;
      // @ts-ignore
      prisma.$queryRaw = () => {
        throw new Error("Connection refused");
      };
      try {
        const res = await request(app).get("/api/health");
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("degraded");
        expect(res.body.database).toBe("disconnected");
        expect(res.body.error).toBe("Database service unavailable.");
      } finally {
        prisma.$queryRaw = originalQueryRaw;
      }
    });
  });

  describe("Authentication & Mock OTP", () => {
    it("requests an OTP and prints it in terminal without exposing in response", async () => {
      const res = await request(app)
        .post("/api/auth/request-otp")
        .send({ phone: testPhoneUser1 });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain("OTP generated");
      expect(res.body.otp).toBeUndefined();
    });

    it("rejects invalid phone number formats", async () => {
      const res = await request(app)
        .post("/api/auth/request-otp")
        .send({ phone: "invalid-phone" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("verifies OTP successfully and returns JWT token", async () => {
      if (!dbAvailable) return;
      _setOtpForTesting(testPhoneUser1, "123456", 300);
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser1, otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe(testPhoneUser1);
      tokenUser1 = res.body.token;
      userId1 = res.body.user.id;
    });

    it("prevents reuse of an already-verified OTP", async () => {
      if (!dbAvailable) return;
      _setOtpForTesting(testPhoneUser1, "654321", 300);
      const firstAttempt = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser1, otp: "654321" });
      expect(firstAttempt.status).toBe(200);

      const secondAttempt = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser1, otp: "654321" });
      expect(secondAttempt.status).toBe(400);
      expect(secondAttempt.body.code).toBe("OTP_NOT_REQUESTED");
    });

    it("rejects expired OTPs", async () => {
      // Set OTP with -1s TTL so it's expired
      _setOtpForTesting(testPhoneUser1, "999999", -1);
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser1, otp: "999999" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OTP_EXPIRED");
    });

    it("rejects invalid OTP and enforces maximum attempt limit", async () => {
      _setOtpForTesting(testPhoneUser1, "111222", 300);

      // Attempt with wrong OTP 5 times (OTP_MAX_ATTEMPTS = 5)
      for (let i = 0; i < 4; i++) {
        const wrongRes = await request(app)
          .post("/api/auth/verify-otp")
          .send({ phone: testPhoneUser1, otp: "000000" });
        expect(wrongRes.status).toBe(400);
        expect(wrongRes.body.code).toBe("INVALID_OTP");
      }

      // 5th failed attempt should trigger attempts exceeded
      const finalRes = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser1, otp: "000000" });
      expect(finalRes.status).toBe(429);
      expect(finalRes.body.code).toBe("OTP_ATTEMPTS_EXCEEDED");
    });

    it("authenticates a second distinct user", async () => {
      if (!dbAvailable) return;
      _setOtpForTesting(testPhoneUser2, "654321", 300);
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneUser2, otp: "654321" });
      expect(res.status).toBe(200);
      tokenUser2 = res.body.token;
      userId2 = res.body.user.id;
      expect(userId2).not.toBe(userId1);
    });

    it("preserves OTP when database operation fails with connection error and allows subsequent retry", async () => {
      if (!dbAvailable) return;
      const testPhoneRetry = "+919999900099";
      _setOtpForTesting(testPhoneRetry, "888888", 300);

      const originalUpsert = prisma.user.upsert;
      const { Prisma } = await import("@prisma/client");
      // @ts-ignore
      prisma.user.upsert = () => {
        throw new Prisma.PrismaClientInitializationError(
          "Can't reach database server at localhost:5432",
          "6.8.2"
        );
      };

      try {
        const failureRes = await request(app)
          .post("/api/auth/verify-otp")
          .send({ phone: testPhoneRetry, otp: "888888" });
        expect(failureRes.status).toBe(503);
        expect(failureRes.body.code).toBe("DATABASE_UNAVAILABLE");
        expect(failureRes.body.error).toContain("Database service unavailable");
      } finally {
        prisma.user.upsert = originalUpsert;
      }

      // Retry immediately with the same OTP — should succeed and not report OTP_NOT_REQUESTED!
      const retryRes = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: testPhoneRetry, otp: "888888" });
      expect(retryRes.status).toBe(200);
      expect(retryRes.body.token).toBeDefined();

      // Clean up test user
      await prisma.user.deleteMany({ where: { phone: testPhoneRetry } });
    });
  });

  describe("Protected Routes & Unauthorized Access", () => {
    it("rejects requests missing Authorization header with 401", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("rejects invalid token format with 401", async () => {
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", "Bearer not-a-valid-jwt-token");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_TOKEN");
    });

    it("rejects expired token with 401", async () => {
      const expiredToken = jwt.sign({ sub: "user-id", phone: "+919999900001" }, env.JWT_SECRET, { expiresIn: "-1s" });
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_TOKEN");
    });
  });

  describe("Loan Management & User Isolation", () => {
    let user1LoanId: string;

    it("creates a loan for user 1", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({
          friendName: "Aman",
          amount: 5000,
          dueDate: "2026-12-31"
        });

      expect(res.status).toBe(201);
      expect(res.body.loan.friendName).toBe("Aman");
      expect(res.body.loan.amount).toBe(5000);
      expect(res.body.loan.outstandingAmount).toBe(5000);
      expect(res.body.loan.repaidAmount).toBe(0);
      expect(res.body.loan.status).toBe("PENDING");
      user1LoanId = res.body.loan.id;
    });

    it("rejects loan creation with non-positive amount", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Aman", amount: -100, dueDate: "2026-12-31" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("rejects loan creation with invalid due date string", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Aman", amount: 100, dueDate: "2026-02-30" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("lists loans for user 1", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`);
      expect(res.status).toBe(200);
      expect(res.body.loans).toBeInstanceOf(Array);
      expect(res.body.loans.some((l: any) => l.id === user1LoanId)).toBe(true);
    });

    it("enforces user isolation: user 2 cannot see user 1's loan", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${tokenUser2}`);
      expect(res.status).toBe(200);
      expect(res.body.loans.some((l: any) => l.id === user1LoanId)).toBe(false);
    });

    it("enforces user isolation: user 2 cannot record repayment on user 1's loan", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post(`/api/loans/${user1LoanId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser2}`)
        .send({ amount: 1000 });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("LOAN_NOT_FOUND");
    });

    it("records a partial repayment on user 1's loan", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post(`/api/loans/${user1LoanId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 2000 });

      expect(res.status).toBe(200);
      expect(res.body.loan.amount).toBe(5000);
      expect(res.body.loan.repaidAmount).toBe(2000);
      expect(res.body.loan.outstandingAmount).toBe(3000);
      expect(res.body.loan.status).toBe("PENDING");
      expect(res.body.loan.repayments).toHaveLength(1);
    });

    it("rejects repayment exceeding outstanding balance", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post(`/api/loans/${user1LoanId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 4000 }); // Outstanding is 3000

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OVERPAYMENT");
    });

    it("marks remaining balance as fully repaid via PATCH /repay", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .patch(`/api/loans/${user1LoanId}/repay`)
        .set("Authorization", `Bearer ${tokenUser1}`);

      expect(res.status).toBe(200);
      expect(res.body.loan.repaidAmount).toBe(5000);
      expect(res.body.loan.outstandingAmount).toBe(0);
      expect(res.body.loan.status).toBe("REPAID");
    });

    it("rejects further repayments on an already fully repaid loan", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .post(`/api/loans/${user1LoanId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("LOAN_ALREADY_REPAID");
    });
  });

  describe("Financial Calculations & Summary Verification (Assignment Specification)", () => {
    const calcUserPhone = "+919999900003";
    let calcToken: string;

    beforeAll(async () => {
      if (!dbAvailable) return;
      try {
        await prisma.user.deleteMany({ where: { phone: calcUserPhone } });
      } catch {
        return;
      }
      _setOtpForTesting(calcUserPhone, "123456", 300);
      const auth = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: calcUserPhone, otp: "123456" });
      calcToken = auth.body.token;

      // Compute dates relative to controlled today
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);

      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      // Loan A: ₹5,000, repaid ₹2,000, due yesterday
      const loanARes = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${calcToken}`)
        .send({ friendName: "Friend A", amount: 5000, dueDate: fmt(yesterday) });
      const loanAId = loanARes.body.loan.id;
      await request(app)
        .post(`/api/loans/${loanAId}/repayments`)
        .set("Authorization", `Bearer ${calcToken}`)
        .send({ amount: 2000 });

      // Loan B: ₹3,000, repaid ₹0, due tomorrow
      await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${calcToken}`)
        .send({ friendName: "Friend B", amount: 3000, dueDate: fmt(tomorrow) });

      // Loan C: ₹2,000, repaid ₹2,000, due last week
      const loanCRes = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${calcToken}`)
        .send({ friendName: "Friend C", amount: 2000, dueDate: fmt(lastWeek) });
      const loanCId = loanCRes.body.loan.id;
      await request(app)
        .patch(`/api/loans/${loanCId}/repay`)
        .set("Authorization", `Bearer ${calcToken}`);
    });

    afterAll(async () => {
      if (dbAvailable) {
        try {
          await prisma.user.deleteMany({ where: { phone: calcUserPhone } });
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("calculates exact required assignment values for Loan A, B, and C", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get("/api/summary")
        .set("Authorization", `Bearer ${calcToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        totalLent: 10000,
        totalRepaid: 4000,
        outstandingAmount: 6000,
        totalOutstandingAmount: 6000,
        overdueAmount: 3000,
        totalOverdueAmount: 3000,
        activeLoans: 2,
        partiallyRepaidLoans: 1,
        repaidLoans: 1,
        fullyRepaidLoans: 1,
        overdueLoans: 1,
        totalLoans: 3
      });
    });

    it("correctly identifies overdue status in loan listing", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${calcToken}`);

      expect(res.status).toBe(200);
      const loans = res.body.loans;
      const loanA = loans.find((l: any) => l.friendName === "Friend A");
      const loanB = loans.find((l: any) => l.friendName === "Friend B");
      const loanC = loans.find((l: any) => l.friendName === "Friend C");

      // Loan A is overdue because due yesterday and outstanding > 0
      expect(loanA.status).toBe("OVERDUE");
      expect(loanA.isOverdue).toBe(true);
      expect(loanA.outstandingAmount).toBe(3000);

      // Loan B is pending because due tomorrow
      expect(loanB.status).toBe("PENDING");
      expect(loanB.isOverdue).toBe(false);
      expect(loanB.outstandingAmount).toBe(3000);

      // Loan C is repaid (even though due last week, fully repaid loans never show overdue)
      expect(loanC.status).toBe("REPAID");
      expect(loanC.isOverdue).toBe(false);
      expect(loanC.outstandingAmount).toBe(0);
    });
  });
});
