import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { decimalToNumber, fromCents, toCents } from "../utils/money";

function getPaidCents(repayments: Array<{ amount: Prisma.Decimal }>): number {
  return repayments.reduce((sum, item) => sum + toCents(item.amount.toString()), 0);
}

function serializeLoan(loan: {
  id: string; friendName: string; amount: Prisma.Decimal; dueDate: Date; createdAt: Date;
  repayments: Array<{ id: string; amount: Prisma.Decimal; repaidAt: Date }>
}, today = new Date()) {
  const amountCents = toCents(loan.amount.toString());
  const repaidCents = getPaidCents(loan.repayments);
  const outstandingCents = Math.max(0, amountCents - repaidCents);
  const dueDateKey = loan.dueDate.toISOString().slice(0, 10);
  const todayKey = today.toISOString().slice(0, 10);
  const overdue = dueDateKey < todayKey && outstandingCents > 0;
  return {
    id: loan.id,
    friendName: loan.friendName,
    amount: fromCents(amountCents),
    repaidAmount: fromCents(repaidCents),
    outstandingAmount: fromCents(outstandingCents),
    dueDate: dueDateKey,
    createdAt: loan.createdAt.toISOString(),
    status: outstandingCents === 0 ? "REPAID" : overdue ? "OVERDUE" : "PENDING",
    isOverdue: overdue,
    repayments: loan.repayments.map((r) => ({
      id: r.id, amount: decimalToNumber(r.amount), repaidAt: r.repaidAt.toISOString()
    }))
  };
}

const loanInclude = { repayments: { orderBy: { repaidAt: "asc" as const } } };

export async function listLoans(userId: string, asOfDate = new Date()) {
  const loans = await prisma.loan.findMany({
    where: { userId },
    include: loanInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
  });
  return loans.map((loan) => serializeLoan(loan, asOfDate));
}

export async function createLoan(userId: string, input: { friendName: string; amount: number; dueDate: string }, asOfDate = new Date()) {
  const loan = await prisma.loan.create({
    data: {
      userId,
      friendName: input.friendName.trim(),
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      dueDate: new Date(`${input.dueDate}T00:00:00.000Z`)
    },
    include: loanInclude
  });
  return serializeLoan(loan, asOfDate);
}

async function findOwnedLoan(userId: string, loanId: string) {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId }, include: loanInclude });
  if (!loan) throw new AppError(404, "Loan not found.", "LOAN_NOT_FOUND");
  return loan;
}

export async function recordRepayment(userId: string, loanId: string, amount: number) {
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({
      where: { id: loanId, userId },
      include: { repayments: true }
    });
    if (!loan) throw new AppError(404, "Loan not found.", "LOAN_NOT_FOUND");
    const amountCents = toCents(loan.amount.toString());
    const paidCents = loan.repayments.reduce((sum, r) => sum + toCents(r.amount.toString()), 0);
    const repaymentCents = toCents(amount);
    const remainingCents = amountCents - paidCents;
    if (remainingCents <= 0) throw new AppError(400, "This loan is already fully repaid.", "LOAN_ALREADY_REPAID");
    if (repaymentCents > remainingCents) throw new AppError(400, "Repayment cannot exceed the outstanding balance.", "OVERPAYMENT");
    await tx.repayment.create({
      data: { loanId, amount: new Prisma.Decimal((repaymentCents / 100).toFixed(2)) }
    });
    const updated = await tx.loan.findFirst({ where: { id: loanId, userId }, include: loanInclude });
    if (!updated) throw new AppError(404, "Loan not found.", "LOAN_NOT_FOUND");
    return serializeLoan(updated);
  });
}

export async function repayLoanFully(userId: string, loanId: string) {
  const loan = await findOwnedLoan(userId, loanId);
  const amountCents = toCents(loan.amount.toString());
  const paidCents = getPaidCents(loan.repayments);
  const remainingCents = amountCents - paidCents;
  if (remainingCents <= 0) throw new AppError(400, "This loan is already fully repaid.", "LOAN_ALREADY_REPAID");
  return recordRepayment(userId, loanId, fromCents(remainingCents));
}

export async function getSummary(userId: string, asOfDate = new Date()) {
  const loans = await prisma.loan.findMany({ where: { userId }, include: { repayments: true } });
  const today = asOfDate.toISOString().slice(0, 10);
  let lentCents = 0, repaidCents = 0, outstandingCents = 0, overdueCents = 0;
  let activeLoans = 0, repaidLoans = 0;
  for (const loan of loans) {
    const loanCents = toCents(loan.amount.toString());
    const paidCents = getPaidCents(loan.repayments);
    const remaining = Math.max(0, loanCents - paidCents);
    lentCents += loanCents;
    repaidCents += paidCents;
    outstandingCents += remaining;
    if (remaining === 0) repaidLoans += 1;
    else {
      activeLoans += 1;
      if (loan.dueDate.toISOString().slice(0, 10) < today) overdueCents += remaining;
    }
  }
  return {
    totalLent: fromCents(lentCents),
    totalRepaid: fromCents(repaidCents),
    outstandingAmount: fromCents(outstandingCents),
    overdueAmount: fromCents(overdueCents),
    activeLoans,
    repaidLoans,
    totalLoans: loans.length
  };
}
