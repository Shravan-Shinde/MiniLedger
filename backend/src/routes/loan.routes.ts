import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { createLoanSchema, repaymentSchema } from "../validators/schemas";
import { createLoan, listLoans, recordRepayment, repayLoanFully } from "../services/loan.service";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const loans = await listLoans(req.userId!);
  res.json({ loans });
}));

router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const parsed = createLoanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed.", details: parsed.error.flatten() });
  const loan = await createLoan(req.userId!, parsed.data);
  res.status(201).json({ message: "Loan created successfully.", loan });
}));

router.post("/:id/repayments", asyncHandler(async (req: AuthRequest, res) => {
  const parsed = repaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed.", details: parsed.error.flatten() });
  const loanId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const loan = await recordRepayment(req.userId!, loanId, parsed.data.amount);
  res.json({ message: "Repayment recorded successfully.", loan });
}));

router.patch("/:id/repay", asyncHandler(async (req: AuthRequest, res) => {
  const loanId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const loan = await repayLoanFully(req.userId!, loanId);
  res.json({ message: "Loan marked as repaid.", loan });
}));

export default router;
