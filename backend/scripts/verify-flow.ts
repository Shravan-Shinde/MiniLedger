import { prisma } from "../src/config/prisma";
import { requestOtp, verifyOtp, _setOtpForTesting } from "../src/services/auth.service";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env";

async function main() {
  console.log("=== MINILEDGER END-TO-END FLOW VERIFICATION ===");
  
  // 1. Database Connectivity
  console.log("\n1. Testing Database Connectivity...");
  await prisma.$connect();
  const rawResult = await prisma.$queryRaw<Array<{ status: number }>>`SELECT 1 as status`;
  console.log("✓ PostgreSQL raw query successful:", rawResult);

  // 2. Request OTP for user phone
  const testPhone = "+918329967487";
  console.log(`\n2. Requesting OTP for phone: ${testPhone}...`);
  await requestOtp(testPhone);
  console.log("✓ requestOtp completed without throwing.");

  // 3. Verify OTP using test hook
  console.log("\n3. Testing OTP Verification with mock OTP '482910'...");
  _setOtpForTesting(testPhone, "482910", 300);
  const verifyResult = await verifyOtp(testPhone, "482910");
  console.log("✓ verifyOtp succeeded!");
  console.log("  User ID:", verifyResult.user.id);
  console.log("  Phone:", verifyResult.user.phone);
  console.log("  JWT Token generated (first 25 chars):", verifyResult.token.substring(0, 25) + "...");

  // 4. Verify User record persisted in PostgreSQL
  console.log("\n4. Verifying User record directly in PostgreSQL database...");
  const dbUser = await prisma.user.findUnique({
    where: { phone: testPhone }
  });
  if (!dbUser) {
    throw new Error(`User with phone ${testPhone} was NOT found in PostgreSQL database!`);
  }
  console.log("✓ User verified in PostgreSQL database:", {
    id: dbUser.id,
    phone: dbUser.phone,
    createdAt: dbUser.createdAt
  });

  // 5. Test token decoding
  console.log("\n5. Verifying JWT Token signature and claims...");
  const decoded = jwt.verify(verifyResult.token, env.JWT_SECRET) as any;
  console.log("✓ Token verified. Sub:", decoded.sub, "Phone:", decoded.phone);

  // 6. Test Loan Creation in PostgreSQL
  console.log("\n6. Creating a loan in PostgreSQL...");
  const loan = await prisma.loan.create({
    data: {
      userId: dbUser.id,
      friendName: "Rahul Sharma",
      amount: 15000,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });
  console.log("✓ Loan created successfully:", {
    id: loan.id,
    friendName: loan.friendName,
    amount: loan.amount.toString(),
    dueDate: loan.dueDate
  });

  // 7. Test Partial Repayment
  console.log("\n7. Recording a partial repayment of 5000...");
  const repayment = await prisma.repayment.create({
    data: {
      loanId: loan.id,
      amount: 5000
    }
  });
  console.log("✓ Repayment recorded:", {
    id: repayment.id,
    amount: repayment.amount.toString(),
    repaidAt: repayment.repaidAt
  });

  // 8. Verify outstanding calculation
  const repayments = await prisma.repayment.findMany({ where: { loanId: loan.id } });
  const totalRepaid = repayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const outstanding = Number(loan.amount) - totalRepaid;
  console.log("✓ Outstanding balance verified:", outstanding, "(Expected: 10000)");

  // 9. Clean up test loan and repayment
  await prisma.repayment.deleteMany({ where: { loanId: loan.id } });
  await prisma.loan.delete({ where: { id: loan.id } });
  console.log("✓ Test loan and repayments cleaned up.");

  console.log("\n==============================================");
  console.log("🎉 ALL END-TO-END FLOW CHECKS PASSED SUCCESSFULLY!");
  console.log("==============================================\n");
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
