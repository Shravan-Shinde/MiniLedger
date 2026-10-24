import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { env } from "../src/config/env";
import { _clearOtpStoreForTesting, _setOtpForTesting } from "../src/services/auth.service";

// In-memory data store for isolated mock testing
interface MockUser {
  id: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockRepayment {
  id: string;
  loanId: string;
  amount: Prisma.Decimal;
  repaidAt: Date;
}

interface MockLoan {
  id: string;
  userId: string;
  friendName: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

let mockUsers: MockUser[] = [];
let mockLoans: MockLoan[] = [];
let mockRepayments: MockRepayment[] = [];

// Mock Prisma client module
vi.mock("../src/config/prisma", () => {
  return {
    prisma: {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
      user: {
        upsert: vi.fn(async ({ where, create }: { where: { phone: string }; create: { phone: string } }) => {
          let user = mockUsers.find((u) => u.phone === where.phone);
          if (!user) {
            user = {
              id: `user_${mockUsers.length + 1}`,
              phone: create.phone,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            mockUsers.push(user);
          }
          return user;
        }),
        deleteMany: vi.fn(async () => ({ count: 0 }))
      },
      loan: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const loan: MockLoan = {
            id: `loan_${mockLoans.length + 1}`,
            userId: data.userId,
            friendName: data.friendName,
            amount: data.amount,
            dueDate: data.dueDate,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          mockLoans.push(loan);
          return { ...loan, repayments: [] };
        }),
        findFirst: vi.fn(async ({ where }: { where: { id: string; userId?: string } }) => {
          const loan = mockLoans.find((l) => l.id === where.id && (!where.userId || l.userId === where.userId));
          if (!loan) return null;
          const repayments = mockRepayments.filter((r) => r.loanId === loan.id);
          return { ...loan, repayments };
        }),
        findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
          const userLoans = mockLoans.filter((l) => l.userId === where.userId);
          return userLoans.map((l) => ({
            ...l,
            repayments: mockRepayments.filter((r) => r.loanId === l.id)
          }));
        })
      },
      repayment: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const repayment: MockRepayment = {
            id: `rep_${mockRepayments.length + 1}`,
            loanId: data.loanId,
            amount: data.amount,
            repaidAt: new Date()
          };
          mockRepayments.push(repayment);
          return repayment;
        })
      },
      $transaction: vi.fn(async (callback: any) => {
        // Run transaction against mock prisma client
        const tx = {
          loan: {
            findFirst: vi.fn(async ({ where }: { where: { id: string; userId?: string } }) => {
              const loan = mockLoans.find((l) => l.id === where.id && (!where.userId || l.userId === where.userId));
              if (!loan) return null;
              const repayments = mockRepayments.filter((r) => r.loanId === loan.id);
              return { ...loan, repayments };
            })
          },
          repayment: {
            create: vi.fn(async ({ data }: { data: any }) => {
              const repayment: MockRepayment = {
                id: `rep_${mockRepayments.length + 1}`,
                loanId: data.loanId,
                amount: data.amount,
                repaidAt: new Date()
              };
              mockRepayments.push(repayment);
              return repayment;
            })
          }
        };
        return callback(tx);
      })
    }
  };
});

// Import app after mocking prisma
import { app } from "../src/app";

describe("MiniLedger Automated Test Suite (Isolated Environment)", () => {
  const user1Phone = "+919876543210";
  const user2Phone = "+919123456789";
  let tokenUser1: string;
  let tokenUser2: string;
  let userId1: string;
  let userId2: string;

  beforeEach(() => {
    _clearOtpStoreForTesting();
  });

  describe("1. Health Endpoint", () => {
    it("GET /api/health returns 200 with service status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("miniledger-api");
      expect(res.body.database).toBe("connected");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("2. Authentication & Mock OTP Flow", () => {
    it("POST /api/auth/request-otp generates OTP in server logs without leaking in response", async () => {
      const res = await request(app)
        .post("/api/auth/request-otp")
        .send({ phone: user1Phone });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("OTP generated");
      expect(res.body.otp).toBeUndefined();
    });

    it("POST /api/auth/request-otp rejects malformed phone numbers", async () => {
      const res = await request(app)
        .post("/api/auth/request-otp")
        .send({ phone: "not-a-number" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("POST /api/auth/verify-otp verifies OTP and returns JWT token and user info", async () => {
      _setOtpForTesting(user1Phone, "123456", 300);

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: user1Phone, otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe(user1Phone);
      tokenUser1 = res.body.token;
      userId1 = res.body.user.id;
    });

    it("POST /api/auth/verify-otp rejects unrequested OTPs", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "+919999999999", otp: "123456" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OTP_NOT_REQUESTED");
    });

    it("POST /api/auth/verify-otp rejects expired OTPs", async () => {
      _setOtpForTesting(user1Phone, "999999", -1);

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: user1Phone, otp: "999999" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OTP_EXPIRED");
    });

    it("POST /api/auth/verify-otp rejects invalid OTP and enforces rate-limiting", async () => {
      _setOtpForTesting(user1Phone, "555666", 300);

      for (let i = 0; i < 4; i++) {
        const wrongRes = await request(app)
          .post("/api/auth/verify-otp")
          .send({ phone: user1Phone, otp: "000000" });
        expect(wrongRes.status).toBe(400);
        expect(wrongRes.body.code).toBe("INVALID_OTP");
      }

      // 5th attempt locks out with HTTP 429
      const lockoutRes = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: user1Phone, otp: "000000" });

      expect(lockoutRes.status).toBe(429);
      expect(lockoutRes.body.code).toBe("OTP_ATTEMPTS_EXCEEDED");
    });

    it("authenticates a second distinct user", async () => {
      _setOtpForTesting(user2Phone, "654321", 300);
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: user2Phone, otp: "654321" });

      expect(res.status).toBe(200);
      tokenUser2 = res.body.token;
      userId2 = res.body.user.id;
      expect(userId2).not.toBe(userId1);
    });
  });

  describe("3. Authentication Requirements & Token Verification", () => {
    it("rejects request without Authorization header with 401", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("rejects request with malformed token with 401", async () => {
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", "Bearer invalid-jwt-token-string");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_TOKEN");
    });

    it("rejects request with expired token with 401", async () => {
      const expired = jwt.sign({ sub: userId1, phone: user1Phone }, env.JWT_SECRET, { expiresIn: "-1s" });
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_TOKEN");
    });
  });

  describe("4. Loan Management & CRUD Operations", () => {
    let createdLoanId: string;

    it("POST /api/loans creates a new loan for authenticated user", async () => {
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({
          friendName: "Vikram",
          amount: 5000,
          dueDate: "2026-12-31"
        });

      expect(res.status).toBe(201);
      expect(res.body.loan.friendName).toBe("Vikram");
      expect(res.body.loan.amount).toBe(5000);
      expect(res.body.loan.repaidAmount).toBe(0);
      expect(res.body.loan.outstandingAmount).toBe(5000);
      expect(res.body.loan.status).toBe("PENDING");
      createdLoanId = res.body.loan.id;
    });

    it("POST /api/loans rejects empty borrower name", async () => {
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "   ", amount: 1000, dueDate: "2026-12-31" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("POST /api/loans rejects zero or negative loan amount", async () => {
      const resZero = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Vikram", amount: 0, dueDate: "2026-12-31" });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Vikram", amount: -500, dueDate: "2026-12-31" });
      expect(resNeg.status).toBe(400);
    });

    it("POST /api/loans rejects invalid calendar date", async () => {
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Vikram", amount: 1000, dueDate: "2026-02-31" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed.");
    });

    it("GET /api/loans lists loans for authenticated user", async () => {
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`);

      expect(res.status).toBe(200);
      expect(res.body.loans).toBeInstanceOf(Array);
      expect(res.body.loans.some((l: any) => l.id === createdLoanId)).toBe(true);
    });

    it("GET /api/loans/:id retrieves loan entry by ID", async () => {
      const res = await request(app)
        .get(`/api/loans/${createdLoanId}`)
        .set("Authorization", `Bearer ${tokenUser1}`);

      expect(res.status).toBe(200);
      expect(res.body.loan.id).toBe(createdLoanId);
      expect(res.body.loan.friendName).toBe("Vikram");
      expect(res.body.loan.amount).toBe(5000);
    });

    it("GET /api/loans/:id returns 404 for non-existent loan", async () => {
      const res = await request(app)
        .get("/api/loans/nonexistent-id")
        .set("Authorization", `Bearer ${tokenUser1}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("LOAN_NOT_FOUND");
    });
  });

  describe("5. User Data Isolation & Security", () => {
    let user1LoanId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "User 1 Private Loan", amount: 2500, dueDate: "2026-11-15" });
      user1LoanId = res.body.loan.id;
    });

    it("User 2 cannot list loans belonging to User 1", async () => {
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${tokenUser2}`);

      expect(res.status).toBe(200);
      expect(res.body.loans.some((l: any) => l.id === user1LoanId)).toBe(false);
    });

    it("User 2 cannot retrieve User 1's loan by ID (returns 404 without leaking info)", async () => {
      const res = await request(app)
        .get(`/api/loans/${user1LoanId}`)
        .set("Authorization", `Bearer ${tokenUser2}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("LOAN_NOT_FOUND");
    });

    it("User 2 cannot record a repayment on User 1's loan", async () => {
      const res = await request(app)
        .post(`/api/loans/${user1LoanId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser2}`)
        .send({ amount: 500 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("LOAN_NOT_FOUND");
    });
  });

  describe("6. Repayments & Overpayment Prevention", () => {
    let loanToRepayId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ friendName: "Ananya", amount: 4000, dueDate: "2026-12-01" });
      loanToRepayId = res.body.loan.id;
    });

    it("records a partial repayment via POST /repayments", async () => {
      const res = await request(app)
        .post(`/api/loans/${loanToRepayId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 1500 });

      expect(res.status).toBe(200);
      expect(res.body.loan.amount).toBe(4000);
      expect(res.body.loan.repaidAmount).toBe(1500);
      expect(res.body.loan.outstandingAmount).toBe(2500);
      expect(res.body.loan.status).toBe("PENDING");
      expect(res.body.loan.repayments).toHaveLength(1);
    });

    it("rejects overpayment exceeding outstanding balance", async () => {
      // Outstanding balance is 4000, attempt 5000
      const res = await request(app)
        .post(`/api/loans/${loanToRepayId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 5000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OVERPAYMENT");
    });

    it("supports partial repayment via POST /api/loans/:id/repay", async () => {
      const res = await request(app)
        .post(`/api/loans/${loanToRepayId}/repay`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.loan.repaidAmount).toBe(1000);
      expect(res.body.loan.outstandingAmount).toBe(3000);
    });

    it("marks entire loan as fully repaid via POST /api/loans/:id/repay without amount", async () => {
      const res = await request(app)
        .post(`/api/loans/${loanToRepayId}/repay`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.loan.repaidAmount).toBe(4000);
      expect(res.body.loan.outstandingAmount).toBe(0);
      expect(res.body.loan.status).toBe("REPAID");
    });

    it("rejects further repayment attempts on an already fully repaid loan", async () => {
      // Repay fully first
      await request(app)
        .patch(`/api/loans/${loanToRepayId}/repay`)
        .set("Authorization", `Bearer ${tokenUser1}`);

      // Attempt to repay more
      const res = await request(app)
        .post(`/api/loans/${loanToRepayId}/repayments`)
        .set("Authorization", `Bearer ${tokenUser1}`)
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("LOAN_ALREADY_REPAID");
    });
  });

  describe("7. Summary Aggregation & Overdue Status (Assignment Specification)", () => {
    const summaryUserPhone = "+919800011122";
    let summaryToken: string;

    beforeEach(async () => {
      _setOtpForTesting(summaryUserPhone, "123456", 300);
      const auth = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: summaryUserPhone, otp: "123456" });
      summaryToken = auth.body.token;

      // Dates: yesterday (overdue), tomorrow (active), last week (repaid)
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);

      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      // Loan A: ₹5,000 lent, ₹2,000 repaid, due yesterday (overdue)
      const resA = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${summaryToken}`)
        .send({ friendName: "Summary A", amount: 5000, dueDate: fmt(yesterday) });
      await request(app)
        .post(`/api/loans/${resA.body.loan.id}/repayments`)
        .set("Authorization", `Bearer ${summaryToken}`)
        .send({ amount: 2000 });

      // Loan B: ₹3,000 lent, ₹0 repaid, due tomorrow (active)
      await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${summaryToken}`)
        .send({ friendName: "Summary B", amount: 3000, dueDate: fmt(tomorrow) });

      // Loan C: ₹2,000 lent, ₹2,000 repaid, due last week (fully repaid - not overdue)
      const resC = await request(app)
        .post("/api/loans")
        .set("Authorization", `Bearer ${summaryToken}`)
        .send({ friendName: "Summary C", amount: 2000, dueDate: fmt(lastWeek) });
      await request(app)
        .patch(`/api/loans/${resC.body.loan.id}/repay`)
        .set("Authorization", `Bearer ${summaryToken}`);
    });

    it("GET /api/summary returns accurate aggregations and counts", async () => {
      const res = await request(app)
        .get("/api/summary")
        .set("Authorization", `Bearer ${summaryToken}`);

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

    it("GET /api/loans marks overdue loans and clears overdue flag for fully repaid loans", async () => {
      const res = await request(app)
        .get("/api/loans")
        .set("Authorization", `Bearer ${summaryToken}`);

      expect(res.status).toBe(200);
      const loans = res.body.loans;
      const loanA = loans.find((l: any) => l.friendName === "Summary A");
      const loanB = loans.find((l: any) => l.friendName === "Summary B");
      const loanC = loans.find((l: any) => l.friendName === "Summary C");

      expect(loanA.status).toBe("OVERDUE");
      expect(loanA.isOverdue).toBe(true);
      expect(loanA.outstandingAmount).toBe(3000);

      expect(loanB.status).toBe("PENDING");
      expect(loanB.isOverdue).toBe(false);
      expect(loanB.outstandingAmount).toBe(3000);

      expect(loanC.status).toBe("REPAID");
      expect(loanC.isOverdue).toBe(false);
      expect(loanC.outstandingAmount).toBe(0);
    });
  });

  describe("8. Centralized Error Handling & Security", () => {
    it("returns 404 with structured JSON for nonexistent routes", async () => {
      const res = await request(app).get("/api/random-nonexistent-route");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Route not found.");
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });
});
